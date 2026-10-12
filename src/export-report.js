/* Local PNG report text/layout, kept separate from project state and the SVG camera. */
(() => {
  'use strict';
  const width = 2200, margin = 48;
  const a4Width = 3508, a4Height = 2480, a4Margin = 72;
  const cm = n => n == null ? '?' : (Math.round(n) / 10).toLocaleString('ko-KR', {maximumFractionDigits: 1});
  const known = f => [f.widthMm, f.depthMm].every(n => Number.isFinite(n) && n > 0);
  const verification = {unconfirmed: '미확인', 'plan-observed': '도면 관찰', 'field-measured': '현장 실측 입력'};
  const coverage = {unregistered: '미등록', partial: '일부 등록', complete: '전체 등록 입력 (완전성 미검증)'};

  function model(project, options, gaps) {
    const scene = project.scenes.find(s => s.id === project.activeScene);
    const excluded = project.furniture.filter(f => f.excludeFromMove);
    const placed = project.furniture.filter(f => scene.placements[f.id] && !f.excludeFromMove);
    const groups = [['walls', '벽'], ['fixedObstacles', '고정 설비'], ['doors', '문'], ['roomPolygons', '방 경계']];
    const doorOpenings = new Map(project.geometry.doors.map(door => [door.id, window.HOME_GEOMETRY.doorOpening(door, project.geometry)]));
    const summary = [
      `${options.confirmed ? '사용자 확정 배치' : '잠정 배치'} · 확정은 이 PNG에 선택한 위치만 뜻하며 치수·안전·설치 검증이 아닙니다.`,
      `축척: ${project.background.status === 'user-calibrated' ? '사용자 보정' : '잠정'} (${project.background.mmPerPx} mm/px) · 가로·세로·실제 현장 치수는 별도 확인해야 합니다.`,
      ...groups.map(([key, label]) => {
        const items = project.geometry[key];
        return `${label}: 등록 ${items.length}개 · ${coverage[project.geometry.coverage[key]]} · 검사 제외 ${items.filter(g => !g.checkEnabled).length}개 · 치수 미확인 ${key === 'fixedObstacles' ? items.filter(g => !known(g)).length : 0}개 · 미확인 ${items.filter(g => g.verification === 'unconfirmed').length} / 도면 관찰 ${items.filter(g => g.verification === 'plan-observed').length} / 현장 실측 입력 ${items.filter(g => g.verification === 'field-measured').length}`;
      }),
      `문 입구 연결 미검증: ${[...doorOpenings.values()].filter(opening => !opening.linked).length}개. 벽 연결/개구부 일치는 실제 문틀·통행·반입 검증을 뜻하지 않습니다.`,
      `가구: 등록 ${project.furniture.length}개 · 현재 배치 ${placed.length}개 · 미배치 ${project.furniture.length - placed.length - excluded.length}개 · 이사 제외 ${excluded.length}개 · 치수 누락 ${project.furniture.filter(f => !known(f)).length}개 · 치수 미확인 ${project.furniture.filter(f => !f.verified).length}개`,
      '등록·검사 활성화·입력 치수 기준의 일부 평면 검사입니다. 숨김과 검사 제외는 별개입니다. 미등록 벽·문·미닫이문·손잡이·높이·통로·반입 동선·실측은 미검증이며 경고 0도 안전/설치 가능 보증이 아닙니다.',
      '가구표의 희망 방은 실제 위치 판정이 아닙니다. 중심 X/Y는 원본 도면 좌상단 기준 cm, 회전은 도(°)입니다. 치수 없는 배치 가구는 표에만 기록하고 도면에는 그리지 않습니다.'
    ];
    const rows = placed.map(f => {
      const p = scene.placements[f.id], room = project.rooms.find(r => r.id === f.targetRoom);
      return [String(f.number).padStart(2, '0'), f.name, room ? `${room.name} / ${room.use}` : '미지정', `${cm(f.widthMm)} × ${cm(f.depthMm)} cm${known(f) ? '' : ' · 미확인 / 도면에 그리지 않음'}`, `X ${cm(p.xMm)} / Y ${cm(p.yMm)} cm · ${p.rotation}°`, f.verified ? '치수 사용자 확인' : '치수 미확인'];
    });
    const details = [];
    if (options.gaps) {
      details.push('선택 포함: 가구별 최단 벽/고정 설비 간격 · 본체 사이 직선 거리이며 통로 폭이 아닙니다. 검사 제외/치수 누락 설비, 문·방 경계·사용 여유·다른 가구는 대상에서 제외합니다. 숨김 벽/설비는 계산합니다.');
      for (const f of placed) {
        const gap = gaps[f.id];
        details.push(`${String(f.number).padStart(2, '0')} ${f.name}: ${gap.text}${gap.targetName ? ' · 대상 ' + gap.targetName : ''}`);
      }
    }
    if (options.unknowns) {
      details.push('미확정 / 미배치 상세 목록');
      for (const f of project.furniture.filter(f => !f.excludeFromMove)) {
        const facts = [!known(f) && '폭/깊이 누락 (본체 미표시)', !f.verified && '치수 미확인', !scene.placements[f.id] && '현재 안 미배치'].filter(Boolean);
        if (facts.length) details.push(`${String(f.number).padStart(2, '0')} ${f.name}: ${facts.join(' · ')}`);
      }
      for (const [key, label] of groups) for (const g of project.geometry[key]) {
        const facts = [g.verification !== 'field-measured' && verification[g.verification], !g.checkEnabled && '검사 제외', key === 'fixedObstacles' && !known(g) && '폭/깊이 누락', key === 'doors' && !doorOpenings.get(g.id).linked && doorOpenings.get(g.id).reason].filter(Boolean);
        if (facts.length) details.push(`${label} ${g.name}: ${facts.join(' · ')}`);
      }
    }
    const access = project.geometry.roomPolygons.flatMap(r => r.accessZones || []);
    summary.push(`수동 접근 검토 구역: 등록 ${access.length}개 · 검사 제외 ${access.filter(z => !z.checkEnabled).length}개 · 현장 실측 입력 ${access.filter(z => z.verification === 'field-measured').length}개. 필수 여유폭/실제 접근은 미검증입니다.`);
    if (options.unknowns) for (const z of access) if (z.verification !== 'field-measured' || !z.checkEnabled) details.push(`접근 검토 구역 ${z.name}: ${verification[z.verification]}${z.checkEnabled ? '' : ' · 검사 제외'}`);
    const callouts = options.callouts ? placed.filter(known).map(f => {
      const p = scene.placements[f.id];
      const callout = {id: f.id, number: f.number, name: f.name, dimensions: `${cm(f.widthMm)} × ${cm(f.depthMm)} cm`,
        xMm: p.xMm, yMm: p.yMm, widthMm: f.widthMm, depthMm: f.depthMm, rotation: p.rotation};
      if (options.nearLabels) callout.nearLabels = true;
      return callout;
    }) : [];
    return {sceneId: scene.id, title: `Home Layout Lab | ${scene.name}`, summary, rows, details, callouts};
  }

  function wrap(context, text, maxWidth) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (line && context.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
      lines.push(line);
    }
    return lines;
  }

  function layout(context, report, mapHeight, geometry) {
    const commands = [];
    let y = margin;
    const paragraph = (text, font = '22px sans-serif', color = '#334f5b', lineHeight = 31) => {
      context.font = font;
      const lines = wrap(context, text, width - margin * 2);
      for (const line of lines) { commands.push({kind: 'text', text: line, x: margin, y, font, color}); y += lineHeight; }
      y += 10;
    };
    paragraph(report.title, 'bold 33px sans-serif', '#223c48', 43);
    for (const text of report.summary) paragraph(text);
    const callouts = geometry && report.callouts?.length ? window.HOME_EXPORT_CALLOUTS.layout(context, report.callouts, geometry, y, wrap) : null;
    const mapY = callouts ? callouts.mapY : y;
    y += (callouts ? callouts.height : mapHeight) + 28;
    paragraph('배치 가구표 · 번호는 도면과 대응 · 희망 방은 실제 위치 미검증', 'bold 26px sans-serif');
    const columns = [90, 485, 370, 400, 465, 294];
    const tableRow = (cells, heading = false) => {
      const font = heading ? 'bold 22px sans-serif' : '22px sans-serif';
      context.font = font;
      const lines = cells.map((cell, i) => wrap(context, cell, columns[i] - 24));
      const height = Math.max(...lines.map(l => l.length)) * 31 + 24;
      commands.push({kind: 'rect', x: margin, y, w: width - margin * 2, h: height, color: heading ? '#e3ecef' : '#f5f7f8'});
      let x = margin;
      lines.forEach((cell, i) => { cell.forEach((text, line) => commands.push({kind: 'text', text, x: x + 12, y: y + 12 + line * 31, font, color: '#223c48'})); x += columns[i]; });
      y += height + 2;
    };
    tableRow(['번호', '가구 이름', '희망 방 (위치 판정 아님)', '가로 W × 깊이 D', '중심 좌표 / 회전', '치수 확인 상태'], true);
    for (const row of report.rows) tableRow(row);
    if (!report.rows.length) paragraph('현재 안에 배치된 가구가 없습니다.');
    y += 24;
    for (const text of report.details) paragraph(text);
    paragraph('PNG는 전달용 그림입니다. 개인 배치 JSON은 사진·A/B/C·공통 공간·출처를 보존하는 별도 백업입니다. 앱/Git 파일을 저장해도 현재 개인 배치가 백업되지는 않습니다.');
    const height = Math.ceil(y + margin);
    if (height > 30000 || width * height > 60000000) throw Error('PNG 보고서가 브라우저 캔버스 크기 제한을 넘습니다. 미확정 상세 목록을 끄거나 긴 설명을 줄인 뒤 다시 저장하세요. 내용은 잘라서 저장하지 않았습니다.');
    return {width, height, mapY, mapHeight, commands, callouts};
  }

  function draw(context, page, image) {
    context.fillStyle = 'white'; context.fillRect(0, 0, page.width, page.height);
    context.drawImage(image, (page.width - image.width) / 2, page.mapY);
    if (page.callouts) window.HOME_EXPORT_CALLOUTS.draw(context, page.callouts);
    context.textBaseline = 'top';
    for (const command of page.commands) {
      context.fillStyle = command.color;
      if (command.kind === 'rect') context.fillRect(command.x, command.y, command.w, command.h);
      else { context.font = command.font; context.fillText(command.text, command.x, command.y); }
    }
  }

  function shiftCallouts(callouts, deltaY) {
    callouts.mapY += deltaY;
    for (const label of callouts.labels) {
      label.y += deltaY;
      for (const point of label.points) point.y += deltaY;
    }
    for (const label of callouts.internalLabels) label.y += deltaY;
    return callouts;
  }

  function layoutA4(context, report, mapHeight, geometry) {
    const callouts = geometry && report.callouts?.length
      ? window.HOME_EXPORT_CALLOUTS.layout(context, report.callouts, geometry, 0, wrap, a4Width)
      : null;
    const contentHeight = callouts ? callouts.height : mapHeight;
    if (contentHeight + a4Margin * 2 > a4Height) {
      throw Error('A4 도면 출력에 가구 범례가 모두 들어가지 않습니다. 범례를 끄거나 배치를 줄인 뒤 다시 저장하세요.');
    }
    const top = Math.round((a4Height - contentHeight) / 2);
    if (callouts) shiftCallouts(callouts, top);
    return {
      width: a4Width,
      height: a4Height,
      mapX: callouts?.mapX ?? (a4Width - geometry.mapWidth) / 2,
      mapY: callouts?.mapY ?? top,
      mapWidth: geometry.mapWidth,
      mapHeight,
      commands: [],
      callouts,
      format: 'a4-landscape',
    };
  }
  window.HOME_EXPORT_REPORT = {model, wrap, layout, layoutA4, draw, a4Width, a4Height};
})();
