/* EchoLearn demo. Uploaded images are processed locally and never posted. */
(() => {
  'use strict';

  const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // Add a real GA4 ID only after configuring privacy/consent requirements.
  if (/^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID) && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
    const analytics = document.createElement('script');
    analytics.async = true;
    analytics.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.appendChild(analytics);
  }

  const $ = (selector) => document.querySelector(selector);
  const imageFile = $('#imageFile');
  const dropZone = $('#drop');
  const originalCanvas = $('#original');
  const previewCanvas = $('#preview');
  const analysisOverlay = $('#analysisOverlay');
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 16_000_000;
  const MAX_SIDE = 1200;
  let imageReady = false;
  let imageWidth = 0;
  let imageHeight = 0;
  let enhancedBase = null;
  let automaticBrightnessLift = 0;

  function setStep(active) {
    for (let index = 1; index <= 4; index += 1) {
      const step = $(`#step${index}`);
      step.classList.toggle('active', index === active);
      step.classList.toggle('done', index < active);
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      $('#speechStatus').textContent = 'Speech is unavailable here. Read the suggestion above.';
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.94;
    utterance.onstart = () => { $('#speechStatus').textContent = 'Speaking…'; };
    utterance.onend = () => { $('#speechStatus').textContent = 'Suggestion finished.'; };
    utterance.onerror = () => { $('#speechStatus').textContent = 'Could not play audio. Read the suggestion above.'; };
    window.speechSynthesis.speak(utterance);
  }

  function reportImageProblem(message) {
    $('#uploadStatus').textContent = message;
    $('#applyStatus').textContent = message;
    $('#applyStatus').classList.remove('success');
  }

  async function loadImage(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      reportImageProblem('Choose a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      reportImageProblem('That file is over 12 MB. Choose a smaller image.');
      return;
    }
    $('#uploadStatus').textContent = 'Reading image…';
    try {
      if (!('createImageBitmap' in window)) throw new Error('This browser cannot safely decode the image. Try a current browser.');
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS || bitmap.width > 12000 || bitmap.height > 12000) {
        bitmap.close();
        reportImageProblem('Image dimensions are too large for this demo. Choose a smaller image.');
        return;
      }
      const scale = Math.min(1, MAX_SIDE / bitmap.width, MAX_SIDE / bitmap.height);
      imageWidth = Math.max(1, Math.round(bitmap.width * scale));
      imageHeight = Math.max(1, Math.round(bitmap.height * scale));
      for (const canvas of [originalCanvas, previewCanvas, analysisOverlay]) {
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        canvas.classList.remove('hidden');
      }
      originalCanvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, imageWidth, imageHeight);
      bitmap.close();
      $('#originalPlaceholder').classList.add('hidden');
      $('#previewPlaceholder').classList.add('hidden');
      // Automatic contrast stretch is the first image operation. All following
      // structure cues are computed from this enhanced pixel buffer.
      enhancedBase = enhanceImage();
      previewCanvas.getContext('2d', { alpha: false }).putImageData(enhancedBase, 0, 0);
      imageReady = true;
      $('#applyButton').disabled = false;
      $('#speakButton').disabled = false;
      $('#uploadStatus').textContent = `${file.name} · image ready`;
      analyzeBrightness(enhancedBase.data, 'After automatic enhancement');
      $('#previewTag').textContent = 'Auto-enhanced';
      setStep(3);
      $('#applyStatus').textContent = 'Review the highlighted cues, adjust a setting, then show the simulated result.';
    } catch (error) {
      imageReady = false;
      $('#applyButton').disabled = true;
      $('#speakButton').disabled = true;
      reportImageProblem(error instanceof Error ? error.message : 'Could not read that image. Try another file.');
    }
  }

  function enhanceImage() {
    const source = originalCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, imageWidth, imageHeight);
    const data = source.data;
    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      const luma = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      histogram[luma] += 1;
    }
    const pixelCount = imageWidth * imageHeight;
    const percentile = (fraction) => {
      const target = Math.floor(pixelCount * fraction);
      let count = 0;
      for (let value = 0; value < 256; value += 1) {
        count += histogram[value];
        if (count >= target) return value;
      }
      return 255;
    };
    const low = percentile(0.02);
    const high = percentile(0.98);
    const range = Math.max(1, high - low);
    for (let i = 0; i < data.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        data[i + channel] = Math.max(0, Math.min(255, Math.round((data[i + channel] - low) * 255 / range)));
      }
      data[i + 3] = 255;
    }
    let luminanceTotal = 0;
    let sectorPixels = 0;
    for (let y = 0; y < imageHeight; y += 1) {
      const bounds = sectorBounds(y);
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const i = (y * imageWidth + x) * 4;
        luminanceTotal += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        sectorPixels += 1;
      }
    }
    const enhancedAverage = luminanceTotal / Math.max(1, sectorPixels);
    // Contrast stretching can leave a dark scan dark. Add a gentle exposure
    // lift only when the enhanced frame still averages below the demo target.
    automaticBrightnessLift = Math.max(0, Math.min(70, Math.round(90 - enhancedAverage)));
    if (automaticBrightnessLift) {
      for (let y = 0; y < imageHeight; y += 1) {
        const bounds = sectorBounds(y);
        for (let x = bounds.left; x <= bounds.right; x += 1) {
          const i = (y * imageWidth + x) * 4;
          const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          // Keep true black / fluid-like pixels dark; lift echo returns only.
          if (luma > 8) {
            data[i] = Math.min(255, data[i] + automaticBrightnessLift);
            data[i + 1] = Math.min(255, data[i + 1] + automaticBrightnessLift);
            data[i + 2] = Math.min(255, data[i + 2] + automaticBrightnessLift);
          }
        }
      }
    }
    return source;
  }

  // A trapezoid approximates the ultrasound sector and excludes most screen
  // labels and black letterboxing. It is a geometry cue, not anatomy detection.
  function sectorBounds(y) {
    const startY = imageHeight * 0.18;
    const progress = Math.max(0, Math.min(1, (y - startY) / Math.max(1, imageHeight - startY)));
    const halfWidth = imageWidth * (0.08 + 0.37 * progress);
    const center = imageWidth * 0.5;
    return {
      left: Math.max(0, Math.floor(center - halfWidth)),
      right: Math.min(imageWidth - 1, Math.ceil(center + halfWidth))
    };
  }

  function analyzeBrightness(pixels, stage) {
    let luminanceTotal = 0;
    let sectorPixels = 0;
    for (let y = 0; y < imageHeight; y += 1) {
      const bounds = sectorBounds(y);
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const i = (y * imageWidth + x) * 4;
        luminanceTotal += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        sectorPixels += 1;
      }
    }
    const average = luminanceTotal / Math.max(1, sectorPixels);
    const regions = findPossibleDarkRegions(pixels);
    drawRegionHighlights(regions);
    const chamberCue = regions.length
      ? `The image check found ${regions.length} possible dark space${regions.length === 1 ? '' : ' regions'}, around ${regions.map(regionLocation).join(' and ')}. These are not confirmed heart chambers. `
      : 'The image check did not isolate a clear dark space in the scan sector. This does not mean heart structures are absent. ';
    let brightnessCue;
    if (average < 65) {
      brightnessCue = 'Overall picture brightness appears low. On a live scan, ask your instructor whether gain or brightness should be checked.';
      $('#coach-title').textContent = `${stage} · ${regions.length ? 'possible dark spaces found' : 'overall brightness appears low'}`;
    } else if (average > 190) {
      brightnessCue = 'Overall picture brightness appears high. On a live scan, ask your instructor whether gain or brightness should be checked.';
      $('#coach-title').textContent = `${stage} · ${regions.length ? 'possible dark spaces found' : 'overall brightness appears high'}`;
    } else {
      brightnessCue = 'Overall picture brightness is in the middle range for this simple check.';
      $('#coach-title').textContent = `${stage} · ${regions.length ? 'possible dark spaces highlighted' : 'no clear dark spaces isolated'}`;
    }
    const enhancementDetail = stage === 'After automatic enhancement'
      ? ` Automatic processing applied a contrast stretch${automaticBrightnessLift ? ` and a ${automaticBrightnessLift}-level brightness lift because the contrast-adjusted image remained dark` : ''}.`
      : '';
    $('#suggestion').textContent = `${stage}: ${chamberCue}${brightnessCue}${enhancementDetail} These are approximate visual cues from a simple image rule, not confirmed anatomy. This demo cannot assess heart function, diagnose disease, or replace a clinician’s review.`;
  }

  function regionLocation(region) {
    const x = (region.x + region.width / 2) / imageWidth;
    const y = (region.y + region.height / 2) / imageHeight;
    const side = x < 0.38 ? 'left' : x > 0.62 ? 'right' : 'center';
    const level = y < 0.35 ? 'upper' : y > 0.68 ? 'lower' : 'middle';
    return `${side}-${level}`;
  }

  function findPossibleDarkRegions(pixels) {
    const total = imageWidth * imageHeight;
    const mask = new Uint8Array(total);
    const visited = new Uint8Array(total);
    let fanPixels = 0;
    for (let y = 0; y < imageHeight; y += 1) {
      const { left, right } = sectorBounds(y);
      for (let x = left; x <= right; x += 1) {
        const point = y * imageWidth + x;
        const pixel = point * 4;
        const luminance = 0.2126 * pixels[pixel] + 0.7152 * pixels[pixel + 1] + 0.0722 * pixels[pixel + 2];
        fanPixels += 1;
        if (luminance < 48) mask[point] = 1;
      }
    }
    const queue = new Int32Array(total);
    const candidates = [];
    const minArea = Math.max(120, Math.floor(fanPixels * 0.002));
    const maxArea = Math.floor(fanPixels * 0.15);
    for (let start = 0; start < total; start += 1) {
      if (!mask[start] || visited[start]) continue;
      let read = 0;
      let write = 0;
      queue[write++] = start;
      visited[start] = 1;
      let minX = imageWidth, minY = imageHeight, maxX = 0, maxY = 0;
      while (read < write) {
        const point = queue[read++];
        const x = point % imageWidth;
        const y = Math.floor(point / imageWidth);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const neighbors = [x > 0 ? point - 1 : -1, x + 1 < imageWidth ? point + 1 : -1, y > 0 ? point - imageWidth : -1, y + 1 < imageHeight ? point + imageWidth : -1];
        for (const next of neighbors) {
          if (next >= 0 && mask[next] && !visited[next]) {
            visited[next] = 1;
            queue[write++] = next;
          }
        }
      }
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const ratio = width / height;
      if (write >= minArea && write <= maxArea && ratio >= 0.38 && ratio <= 2.4 && minY > imageHeight * 0.08) {
        candidates.push({ x: minX, y: minY, width, height, area: write });
      }
    }
    return candidates.sort((a, b) => b.area - a.area).slice(0, 4);
  }

  function drawRegionHighlights(regions) {
    const context = analysisOverlay.getContext('2d');
    context.clearRect(0, 0, imageWidth, imageHeight);
    context.lineWidth = Math.max(2, Math.round(imageWidth / 300));
    context.font = `bold ${Math.max(11, Math.round(imageWidth / 42))}px Arial`;
    regions.forEach((region, index) => {
      context.strokeStyle = '#66e0c1';
      context.fillStyle = '#66e0c1';
      context.strokeRect(region.x, region.y, region.width, region.height);
      const label = `Possible dark region ${index + 1}`;
      const labelY = Math.max(15, region.y - 5);
      context.fillText(label, region.x, labelY);
    });
  }

  function controlValue(id) {
    return Number($(`#${id}`).value);
  }

  function drawPreview(applied) {
    if (!imageReady) return false;
    const source = enhancedBase.data;
    const context = previewCanvas.getContext('2d', { alpha: false });
    const output = context.createImageData(imageWidth, imageHeight);
    const gain = controlValue('gain');
    const tgc = controlValue('tgc');
    const depth = controlValue('depth');
    const frequency = controlValue('frequency');
    const focus = controlValue('focus');
    const contrast = 1 + (frequency - 3) * 0.05;

    for (let y = 0; y < imageHeight; y += 1) {
      const sourceY = Math.max(0, Math.min(imageHeight - 1, Math.round(imageHeight / 2 + (y - imageHeight / 2) * (depth / 16))));
      const depthBrightness = tgc * ((y / Math.max(1, imageHeight - 1)) - 0.5) * 3;
      for (let x = 0; x < imageWidth; x += 1) {
        const sourceIndex = (sourceY * imageWidth + x) * 4;
        const luminance = 0.2126 * source[sourceIndex] + 0.7152 * source[sourceIndex + 1] + 0.0722 * source[sourceIndex + 2];
        const adjusted = Math.max(0, Math.min(255, Math.round((luminance - 128) * contrast + 128 + (gain - 50) * 1.6 + depthBrightness)));
        const outputIndex = (y * imageWidth + x) * 4;
        output.data[outputIndex] = adjusted;
        output.data[outputIndex + 1] = adjusted;
        output.data[outputIndex + 2] = adjusted;
        output.data[outputIndex + 3] = 255;
      }
    }
    context.putImageData(output, 0, 0);
    const focusY = Math.round(Math.max(0, Math.min(1, focus / depth)) * imageHeight);
    context.save();
    context.strokeStyle = '#65e1c0';
    context.lineWidth = Math.max(1, Math.round(imageHeight / 220));
    context.setLineDash([7, 5]);
    context.beginPath();
    context.moveTo(0, focusY);
    context.lineTo(imageWidth, focusY);
    context.stroke();
    context.restore();

    // Re-check both brightness and possible dark regions on the adjusted
    // pixels so the summary reflects the simulated controls the user applied.
    analyzeBrightness(output.data, 'After simulated adjustment');

    $('#previewTag').textContent = applied ? 'Simulated adjustment' : 'Ready to adjust';
    if (applied) {
      $('#applyStatus').textContent = `Preview and findings updated · Gain ${gain}% · Depth ${depth} cm · TGC ${tgc} · Frequency ${frequency} MHz · Focus ${focus} cm. Read or replay the updated summary.`;
      $('#applyStatus').classList.add('success');
    }
    return true;
  }

  const formats = {
    gain: (value) => `${value}%`,
    depth: (value) => `${value} cm`,
    tgc: (value) => value,
    frequency: (value) => `${value} MHz`,
    focus: (value) => `${value} cm`
  };

  for (const [id, format] of Object.entries(formats)) {
    $(`#${id}`).addEventListener('input', (event) => {
      $(`#${id}Value`).textContent = format(event.target.value);
      if (imageReady) {
        setStep(4);
        $('#applyButton').textContent = 'Show my adjustment';
        $('#applyStatus').textContent = 'Settings changed. Select “Show my adjustment” to update the preview.';
        $('#applyStatus').classList.remove('success');
      }
    });
  }

  imageFile.addEventListener('change', (event) => loadImage(event.target.files[0]));
  dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('over');
    loadImage(event.dataTransfer.files[0]);
  });
  $('#speakButton').addEventListener('click', () => {
    speak(`${$('#coach-title').textContent} ${$('#suggestion').textContent}`);
    setStep(3);
  });
  $('#applyButton').addEventListener('click', () => {
    if (!imageReady) {
      $('#applyStatus').textContent = 'Choose an image first to enable the preview.';
      return;
    }
    if (drawPreview(true)) {
      setStep(4);
      $('#applyButton').textContent = 'Adjustment shown ✓';
    }
  });
  $('#resetButton').addEventListener('click', () => {
    const defaults = { gain: 50, depth: 16, tgc: 0, frequency: 3, focus: 8 };
    for (const [id, value] of Object.entries(defaults)) {
      const control = $(`#${id}`);
      control.value = value;
      control.dispatchEvent(new Event('input'));
    }
    $('#applyButton').textContent = 'Show my adjustment';
    $('#applyStatus').classList.remove('success');
    $('#applyStatus').textContent = imageReady ? 'Values reset. Select “Show my adjustment” to preview them.' : 'Choose an image to enable the preview.';
    $('#previewTag').textContent = imageReady ? 'Ready to adjust' : 'No adjustment yet';
    setStep(imageReady ? 3 : 1);
    if (imageReady) {
      previewCanvas.getContext('2d', { alpha: false }).putImageData(enhancedBase, 0, 0);
      analyzeBrightness(enhancedBase.data, 'After automatic enhancement');
      $('#previewTag').textContent = 'Auto-enhanced';
    }
  });
})();
