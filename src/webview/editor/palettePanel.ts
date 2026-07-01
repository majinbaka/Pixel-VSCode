import { Elements } from './dom';
import { palettes } from './palettes';

export function renderPalettes(el: Elements, onColorPicked: () => void): void {
  for (const palette of palettes) {
    const option = document.createElement('option');
    option.value = palette.name;
    option.textContent = palette.name;
    el.paletteSelect.append(option);
  }

  el.paletteSelect.value = palettes[0].name;
  renderPaletteSwatches(el, onColorPicked);
}

export function renderPaletteSwatches(el: Elements, onColorPicked: () => void): void {
  const palette = palettes.find((item) => item.name === el.paletteSelect.value) ?? palettes[0];
  el.paletteSwatches.replaceChildren();

  for (const color of palette.colors) {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch';
    swatch.type = 'button';
    swatch.title = color;
    swatch.setAttribute('aria-label', color);
    swatch.style.backgroundColor = color;
    swatch.classList.toggle('active', color.toLowerCase() === el.colorInput.value.toLowerCase());
    swatch.addEventListener('click', () => {
      el.colorInput.value = color;
      onColorPicked();
      renderPaletteSwatches(el, onColorPicked);
    });
    el.paletteSwatches.append(swatch);
  }
}
