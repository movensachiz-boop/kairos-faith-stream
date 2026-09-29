export type VerseSlide = { text: string; reference: string; imageUrl: string };

// The slide is a video track so viewers see the same full-screen image as the host.
export function createVerseStage() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  const stream = canvas.captureStream(24);
  const track = stream.getVideoTracks()[0];
  let slide: VerseSlide | null = null;
  let image: HTMLImageElement | null = null;
  let frame = 0;
  let generation = 0;

  function wrap(text: string, maxWidth: number) {
    if (!context) return [text];
    const lines: string[] = [];
    for (const paragraph of text.split(/\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (context.measureText(next).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function draw() {
    if (!context || !slide) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    if (image?.complete && image.naturalWidth) context.drawImage(image, 0, 0, width, height);
    // A dark neutral scrim keeps scripture legible over all three supplied photographs.
    context.fillStyle = "rgba(0, 0, 0, 0.56)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff";
    context.textAlign = "center";
    const text = slide.text.trim();
    let size = 68;
    let lines: string[] = [];
    do {
      context.font = `300 ${size}px Mont Verse, sans-serif`;
      lines = wrap(text, width - 170);
      if (lines.length * size * 1.26 <= height - 210 && lines.every((line) => context.measureText(line).width <= width - 160)) break;
      size -= 2;
    } while (size > 28);
    const step = size * 1.26;
    const top = (height - lines.length * step) / 2 + size * 0.76 - 20;
    lines.forEach((line, index) => context.fillText(line, width / 2, top + index * step, width - 150));
    context.font = '700 30px "Mont Verse Heavy", sans-serif';
    context.fillText(slide.reference.trim(), width / 2, height - 72, width - 120);
    frame = requestAnimationFrame(draw);
  }

  return {
    canvas,
    track,
    async setSlide(next: VerseSlide | null) {
      generation += 1;
      const current = generation;
      cancelAnimationFrame(frame);
      slide = next;
      image = null;
      if (!next) return;
      await Promise.all([document.fonts.load('300 68px "Mont Verse"'), document.fonts.load('700 30px "Mont Verse Heavy"')]);
      if (current !== generation) return;
      const loaded = new Image();
      loaded.src = next.imageUrl;
      try { await loaded.decode(); } catch { /* keep the slide available if an image fails */ }
      if (current !== generation) return;
      image = loaded;
      draw();
    },
    stop() { cancelAnimationFrame(frame); stream.getTracks().forEach((item) => item.stop()); },
  };
}