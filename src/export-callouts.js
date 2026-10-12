(() => {
  'use strict';
  const width = 2200, margin = 48, railWidth = 420, gutter = 32;
  const mapMaxWidthFor = pageWidth => pageWidth - 2 * (margin + railWidth + gutter);
  const mapMaxWidth = mapMaxWidthFor(width);
  const padding = 14, lineHeight = 31, rowGap = 16;
  const nameFont = 'bold 24px sans-serif', dimensionFont = '22px sans-serif';
  const insideNameFont = 'bold 22px sans-serif', insideDimensionFont = '18px sans-serif';
  const insidePadding = 8, insideLineHeight = 26;
  const colors = ['#216f79', '#885738', '#6952a0', '#377541', '#a14263', '#386eaa', '#9a5b13', '#7a3e8e', '#1d6b4f', '#a83232', '#2b5f9e', '#6a6f1f'];
  const lineDashes = [[], [20, 10], [5, 9], [28, 8, 5, 8], [12, 8], [34, 10, 5, 10], [4, 6, 18, 6], [45, 10], [16, 7, 3, 7], [8, 12]];

  function internalLabel(context, item, wrap) {
    const angle = item.rotation * Math.PI / 180;
    const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
    const title = `${String(item.number).padStart(2, '0')} · ${item.name}`;
    for (const lines of [1, 2]) {
      const height = (lines + 1) * insideLineHeight + 2 * insidePadding;
      const roomX = item.bodyWidth - s * height, roomY = item.bodyHeight - c * height;
      if (roomX < 0 || roomY < 0) continue;
      const available = Math.min(c ? roomX / c : Infinity, s ? roomY / s : Infinity) - 2 * insidePadding;
      if (!(available > 0)) continue;
      context.font = insideDimensionFont;
      const dimensionWidth = context.measureText(item.dimensions).width;
      if (dimensionWidth > available) continue;
      context.font = insideNameFont;
      const nameLines = wrap(context, title, available);
      if (nameLines.length > lines) continue;
      if (nameLines.length === 2 && !title.includes('\n')) {
        const space = nameLines[0].lastIndexOf(' ');
        const tail = nameLines[0].slice(space + 1) + nameLines[1];
        if (space > 0 && context.measureText(tail).width <= available) {
          nameLines[0] = nameLines[0].slice(0, space + 1); nameLines[1] = tail;
        }
      }
      const textWidth = Math.max(dimensionWidth, ...nameLines.map(line => context.measureText(line).width));
      if (textWidth > available) continue;
      const width = textWidth + 2 * insidePadding;
      return {id: item.id, x: item.centerX - width / 2, width, height,
        centerY: item.centerY, nameLines, dimensionLines: [item.dimensions]};
    }
    return null;
  }

  function layout(context, items, geometry, top, wrap, pageWidth = width) {
    const {bounds, mapWidth, mapHeight} = geometry;
    const mapX = (pageWidth - mapWidth) / 2;
    // SVG's default xMidYMid meet preserves aspect ratio after integer size rounding.
    const scale = Math.min(mapWidth / bounds.w, mapHeight / bounds.h);
    const insetX = (mapWidth - bounds.w * scale) / 2;
    const insetY = (mapHeight - bounds.h * scale) / 2;
    const labels = [], internalLabels = [], mapped = [], bodyBoxes = [], nearBoxes = [];
    const boxFor = (item, centerX, centerY) => {
      const angle = item.rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
      return {x: centerX - (item.widthMm * c + item.depthMm * s) * scale / 2,
        y: centerY - (item.widthMm * s + item.depthMm * c) * scale / 2,
        width: (item.widthMm * c + item.depthMm * s) * scale,
        height: (item.widthMm * s + item.depthMm * c) * scale};
    };
    const overlaps = (a, b, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
    items.forEach((item, index) => {
      const centerX = mapX + insetX + (item.xMm - bounds.x) * scale;
      const centerY = insetY + (item.yMm - bounds.y) * scale;
      bodyBoxes.push(boxFor(item, centerX, centerY));
      const inside = internalLabel(context, {...item, centerX, centerY,
        bodyWidth: item.widthMm * scale, bodyHeight: item.depthMm * scale}, wrap);
      if (inside) {internalLabels.push(inside); return;}
      mapped.push({item, index, centerX, centerY});
    });
    const nearWidth = Math.min(railWidth, Math.max(250, Math.min(railWidth, mapWidth * .28)));
    for (const {item, index, centerX, centerY} of mapped) {
      context.font = nameFont;
      const nearNameLines = wrap(context, `${String(item.number).padStart(2, '0')} · ${item.name}`, nearWidth - 2 * padding);
      context.font = dimensionFont;
      const nearDimensionLines = wrap(context, item.dimensions, nearWidth - 2 * padding);
      const nearHeight = (nearNameLines.length + nearDimensionLines.length) * lineHeight + padding * 2;
      let near = null;
      if (item.nearLabels && item.widthMm >= 700 && item.depthMm >= 700 && item.name.length <= 24) {
        const candidates = [
          {x: centerX + bodyBoxes[index].width / 2 + gutter, y: centerY - nearHeight / 2, side: 'right'},
          {x: centerX - bodyBoxes[index].width / 2 - gutter - nearWidth, y: centerY - nearHeight / 2, side: 'left'},
          {x: centerX - nearWidth / 2, y: centerY - bodyBoxes[index].height / 2 - gutter - nearHeight, side: 'top'},
          {x: centerX - nearWidth / 2, y: centerY + bodyBoxes[index].height / 2 + gutter, side: 'bottom'}
        ];
        near = candidates.find(candidate => {
          const box = {x: candidate.x, y: candidate.y, width: nearWidth, height: nearHeight};
          return box.x >= mapX + gutter && box.x + box.width <= mapX + mapWidth - gutter && box.y >= insetY + gutter && box.y + box.height <= insetY + mapHeight - gutter
            && !bodyBoxes.some((body, bodyIndex) => bodyIndex !== index && overlaps(box, body, gutter / 2))
            && !nearBoxes.some(other => overlaps(box, other, gutter / 2));
        });
      }
      if (near) {
        const box = {x: near.x, y: near.y, width: nearWidth, height: nearHeight};
        nearBoxes.push(box);
        const dx = near.x + nearWidth / 2 - centerX, dy = near.y + nearHeight / 2 - centerY;
        const length = Math.hypot(dx, dy) || 1, ray = {x: dx / length, y: dy / length};
        const angle = item.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const localX = ray.x * c + ray.y * s, localY = -ray.x * s + ray.y * c;
        const edgeDistance = Math.min(Math.abs(localX) > 1e-12 ? item.widthMm / 2 / Math.abs(localX) : Infinity,
          Math.abs(localY) > 1e-12 ? item.depthMm / 2 / Math.abs(localY) : Infinity);
        const anchor = {x: centerX + ray.x * edgeDistance * scale, y: centerY + ray.y * edgeDistance * scale};
        const end = near.side === 'right' ? {x: near.x, y: near.y + nearHeight / 2}
          : near.side === 'left' ? {x: near.x + nearWidth, y: near.y + nearHeight / 2}
          : near.side === 'top' ? {x: near.x + nearWidth / 2, y: near.y + nearHeight}
          : {x: near.x + nearWidth / 2, y: near.y};
        labels.push({id: item.id, side: 'near', x: near.x, y: near.y, width: nearWidth, height: nearHeight,
          nameLines: nearNameLines, dimensionLines: nearDimensionLines, color: colors[index % colors.length], lineDash: lineDashes[index % lineDashes.length], centerX, centerY,
          anchor, points: [anchor, {x: near.x + nearWidth / 2, y: anchor.y}, {x: end.x, y: end.y}, end]});
        continue;
      }
      const side = centerX < mapX + mapWidth / 3 ? 'left'
        : centerX > mapX + mapWidth * 2 / 3 ? 'right' : 'bottom';
      const angle = item.rotation * Math.PI / 180;
      const c = Math.cos(angle), s = Math.sin(angle);
      const ray = side === 'bottom' ? {x: 0, y: 1} : {x: side === 'left' ? -1 : 1, y: 0};
      const localX = ray.x * c + ray.y * s;
      const localY = -ray.x * s + ray.y * c;
      const edgeDistance = Math.min(
        Math.abs(localX) > 1e-12 ? item.widthMm / 2 / Math.abs(localX) : Infinity,
        Math.abs(localY) > 1e-12 ? item.depthMm / 2 / Math.abs(localY) : Infinity,
      );
      const labelWidth = side === 'bottom' ? Math.min(railWidth, mapWidth) : railWidth;
      context.font = nameFont;
      const nameLines = wrap(context, `${String(item.number).padStart(2, '0')} · ${item.name}`, labelWidth - 2 * padding);
      context.font = dimensionFont;
      const dimensionLines = wrap(context, item.dimensions, labelWidth - 2 * padding);
      labels.push({id: item.id, side, x: side === 'left' ? margin : side === 'right' ? pageWidth - margin - railWidth : mapX,
        width: labelWidth, height: (nameLines.length + dimensionLines.length) * lineHeight + padding * 2,
        nameLines, dimensionLines, color: colors[index % colors.length], lineDash: lineDashes[index % lineDashes.length], centerX, centerY,
        anchorX: centerX + ray.x * edgeDistance * scale,
        anchorOffsetY: ray.y * edgeDistance * scale});
    }
    const rails = ['left', 'right'].map(side => labels.filter(label => label.side === side)
      .sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX || a.id.localeCompare(b.id)));
    const bottom = labels.filter(label => label.side === 'bottom')
      .sort((a, b) => a.centerX - b.centerX || a.centerY - b.centerY || a.id.localeCompare(b.id));
    const bottomWidth = Math.min(railWidth, mapWidth);
    const bottomColumns = bottom.length ? Math.max(1, Math.floor((mapWidth + gutter) / (bottomWidth + gutter))) : 0;
    const bottomRows = [];
    for (let index = 0; index < bottom.length; index += bottomColumns) bottomRows.push(bottom.slice(index, index + bottomColumns));
    const bottomLaneGap = 18;
    const bottomBandInset = 12;
    const maxBottomRowLength = bottomRows.reduce((max, row) => Math.max(max, row.length), 0);
    const bottomBandHeight = Math.max(48, maxBottomRowLength * bottomLaneGap + bottomBandInset);
    const bottomRowGap = bottomBandHeight;
    const bottomHeight = bottomRows.reduce((sum, row) => sum + Math.max(...row.map(label => label.height)), 0)
      + Math.max(0, bottomRows.length - 1) * bottomRowGap;
    const sideHeight = Math.max(mapHeight, ...rails.map(rail => rail.reduce((sum, label) => sum + label.height, 0) + Math.max(0, rail.length - 1) * rowGap));
    const bottomGap = bottomBandHeight;
    const height = sideHeight + (bottomRows.length ? bottomGap + bottomHeight : 0);
    const mapY = top + (sideHeight - mapHeight) / 2;
    for (const label of internalLabels) label.y = mapY + label.centerY - label.height / 2;
    for (const label of labels.filter(label => label.side === 'near')) {
      const delta = mapY;
      label.y += delta;
      for (const point of label.points) point.y += delta;
    }
    for (const rail of rails) {
      let nextY = top;
      for (const label of rail) {
        label.anchor = {x: label.anchorX, y: mapY + label.centerY};
        label.y = Math.max(nextY, label.anchor.y - label.height / 2);
        nextY = label.y + label.height + rowGap;
      }
      let bottom = top + sideHeight;
      for (const label of [...rail].reverse()) {
        label.y = Math.min(label.y, bottom - label.height);
        bottom = label.y - rowGap;
        const left = label.side === 'left', direction = left ? -1 : 1;
        const edge = left ? mapX : mapX + mapWidth;
        const end = {x: left ? label.x + label.width : label.x, y: label.y + label.height / 2};
        label.anchor = {x: label.anchorX, y: mapY + label.centerY};
        label.points = [label.anchor, {x: edge + direction * 10, y: label.anchor.y},
          {x: edge + direction * 22, y: end.y}, end];
      }
    }
    let bottomY = top + sideHeight + bottomGap;
    for (const [rowIndex, row] of bottomRows.entries()) {
      const rowHeight = Math.max(...row.map(label => label.height));
      const rowWidth = row.length * bottomWidth + Math.max(0, row.length - 1) * gutter;
      const rowX = mapX + (mapWidth - rowWidth) / 2;
      row.forEach((label, column) => {
        label.x = rowX + column * (bottomWidth + gutter);
        label.y = bottomY;
        label.anchor = {x: label.anchorX, y: mapY + label.centerY + label.anchorOffsetY};
        const routeY = bottomY - bottomBandHeight + bottomBandInset + column * bottomLaneGap;
        const end = {x: label.x + label.width / 2, y: label.y};
        label.routeY = routeY;
        if (rowIndex === 0) {
          label.points = [label.anchor, {x: label.anchor.x, y: routeY}, {x: end.x, y: routeY}, end];
        } else {
          const left = label.anchor.x < mapX + mapWidth / 2;
          const railX = left ? mapX - 12 : mapX + mapWidth + 12;
          const mapBottom = mapY + mapHeight;
          label.points = [label.anchor, {x: label.anchor.x, y: mapBottom}, {x: railX, y: mapBottom},
            {x: railX, y: routeY}, {x: end.x, y: routeY}, end];
        }
      });
      bottomY += rowHeight + bottomRowGap;
    }
    return {height, mapX, mapY, mapWidth, mapHeight, labels, internalLabels};
  }

  function prepareSvg(text, callouts) {
    const removable = callouts ? [...callouts.internalLabels, ...callouts.labels.filter(label => label.side === 'near')] : [];
    if (!removable.length) return text;
    const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
    const internalIds = new Set(removable.map(label => label.id));
    for (const piece of svg.querySelectorAll('.piece')) {
      if (internalIds.has(piece.getAttribute('data-id'))) piece.querySelector(':scope > text').remove();
    }
    return new XMLSerializer().serializeToString(svg);
  }

  function draw(context, callouts) {
    context.lineJoin = 'round'; context.lineCap = 'round';
    for (const label of callouts.labels) {
      if (typeof context.setLineDash === 'function') context.setLineDash(label.lineDash || []);
      context.beginPath();
      label.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.strokeStyle = 'white'; context.lineWidth = 7; context.stroke();
      context.strokeStyle = label.color; context.lineWidth = 2.5; context.stroke();
      context.beginPath(); context.arc(label.anchor.x, label.anchor.y, 5, 0, Math.PI * 2);
      context.fillStyle = label.color; context.fill();
      context.strokeStyle = 'white'; context.lineWidth = 2; context.stroke();
    }
    if (typeof context.setLineDash === 'function') context.setLineDash([]);
    context.textBaseline = 'top';
    for (const label of callouts.internalLabels) {
      let y = label.y + insidePadding;
      context.fillStyle = '#203f4c'; context.font = insideNameFont;
      for (const line of label.nameLines) {
        context.fillText(line, label.x + (label.width - context.measureText(line).width) / 2, y);
        y += insideLineHeight;
      }
      context.font = insideDimensionFont;
      for (const line of label.dimensionLines) {
        context.fillText(line, label.x + (label.width - context.measureText(line).width) / 2, y);
        y += insideLineHeight;
      }
    }
    for (const label of callouts.labels) {
      context.fillStyle = '#f5f8f9'; context.fillRect(label.x, label.y, label.width, label.height);
      context.fillStyle = label.color; context.fillRect(label.x, label.y, 4, label.height);
      const swatchX = label.x + label.width - 48, swatchY = label.y + padding + 10;
      const dash = label.lineDash?.length ? label.lineDash : [48];
      let cursor = swatchX, dashIndex = 0, draw = true;
      while (cursor < label.x + label.width - padding) {
        const length = Math.min(dash[dashIndex % dash.length], label.x + label.width - padding - cursor);
        if (draw) context.fillRect(cursor, swatchY, length, 5);
        cursor += length; dashIndex += 1; draw = !draw;
      }
      let y = label.y + padding;
      context.font = nameFont; context.fillStyle = '#223c48';
      for (const line of label.nameLines) {context.fillText(line, label.x + padding, y); y += lineHeight;}
      context.font = dimensionFont; context.fillStyle = '#334f5b';
      for (const line of label.dimensionLines) {context.fillText(line, label.x + padding, y); y += lineHeight;}
    }
  }
  window.HOME_EXPORT_CALLOUTS = {mapMaxWidth, mapMaxWidthFor, layout, draw, prepareSvg};
})();
