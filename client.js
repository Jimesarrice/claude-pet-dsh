;(() => {
  window.__ModuleLoader__.load({
    id: 'claude-pet-dsh',
    factory: (require) => {
      const React = require('react');
      const { useEffect, useRef, useState } = React;
      const h = React.createElement;

      const STATE_URL = '/claude-pet-dsh/state';
      const SHEET_URL = '/claude-pet-dsh/spritesheet.webp';
      const CELL_W = 192;
      const CELL_H = 208;
      const FRAME_MS = 130;
      const POS_KEY = 'claude-pet-dsh.position';

      const ROWS = {
        idle: { row: 0, frames: 6, loop: true },
        working: { row: 7, frames: 6, loop: true },
        waiting: { row: 6, frames: 6, loop: true },
        complete: { row: 4, frames: 5, loop: false },
        error: { row: 5, frames: 8, loop: true },
        connecting: { row: 3, frames: 4, loop: true },
        offline: { row: 0, frames: 6, loop: true }
      };

      const LABEL = {
        idle: '待机',
        working: '工作中',
        waiting: '等你',
        complete: '完成',
        error: '出错',
        connecting: '连接中',
        offline: '打盹'
      };

      const COPY = {
        idle: '在。有任务时我会跟着进度动。',
        working: '正在做…',
        waiting: '需要你确认一下。',
        complete: '这一轮完成啦。',
        error: '遇到一点问题。',
        connecting: '正在连接工作台…',
        offline: '先打个盹。'
      };

      const rootStyle = {
        position: 'fixed',
        zIndex: 2147483000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '6px',
        pointerEvents: 'none',
        fontFamily: '"Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif',
        userSelect: 'none'
      };

      const bubbleStyle = {
        pointerEvents: 'auto',
        width: '250px',
        padding: '10px 12px 9px',
        border: '1px solid rgba(240, 200, 150, .28)',
        borderRadius: '14px',
        background: 'rgba(30, 27, 24, .94)',
        color: '#f7e8d2',
        boxShadow: '0 12px 30px rgba(0, 0, 0, .3)',
        backdropFilter: 'blur(10px)'
      };

      const headerStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        color: 'rgba(247, 232, 210, .58)',
        font: '10px/1.2 ui-monospace, monospace',
        letterSpacing: '.12em'
      };

      const petBoxStyle = {
        pointerEvents: 'auto',
        cursor: 'grab',
        touchAction: 'none',
        filter: 'drop-shadow(0 10px 14px rgba(0,0,0,.28))'
      };

      const canvasStyle = {
        display: 'block',
        width: '168px',
        height: '182px',
        imageRendering: 'pixelated'
      };

      const buttonStyle = {
        border: '1px solid rgba(240, 200, 150, .28)',
        borderRadius: '999px',
        background: 'transparent',
        color: '#f7e8d2',
        cursor: 'pointer',
        font: '11px/1.2 "Microsoft YaHei UI", sans-serif',
        padding: '3px 8px'
      };

      function loadPosition() {
        try {
          const value = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
          if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return value;
        } catch {}
        return null;
      }

      function savePosition(value) {
        try { localStorage.setItem(POS_KEY, JSON.stringify(value)); } catch {}
      }

      function clampPosition(x, y) {
        const width = 260;
        const height = 360;
        return {
          x: Math.max(6, Math.min(x, window.innerWidth - width - 6)),
          y: Math.max(6, Math.min(y, window.innerHeight - height - 6))
        };
      }

      function taskLine(state, task) {
        if (!task?.title) return COPY[state] ?? '';
        if (state === 'working') return '正在做…';
        if (state === 'waiting') return '等你确认一下。';
        if (state === 'complete') return '这一轮完成啦。';
        if (state === 'error') return '卡住了，看看我。';
        return COPY[state] ?? '';
      }

      function Pet() {
        const [snapshot, setSnapshot] = useState({ state: 'idle', task: null });
        const [bubble, setBubble] = useState(true);
        const [hidden, setHidden] = useState(false);
        const [position, setPosition] = useState(loadPosition);
        const canvasRef = useRef(null);
        const imageRef = useRef(null);
        const snapshotRef = useRef(snapshot);
        const dragRef = useRef(null);
        const movedRef = useRef(false);
        const positionRef = useRef(position);
        positionRef.current = position;
        snapshotRef.current = snapshot;

        useEffect(() => {
          let alive = true;
          const tick = async () => {
            try {
              const response = await fetch(STATE_URL, { cache: 'no-store' });
              if (!response.ok) return;
              const data = await response.json();
              if (alive && data) setSnapshot(data);
            } catch {}
          };
          tick();
          const timer = setInterval(tick, 500);
          return () => { alive = false; clearInterval(timer); };
        }, []);

        useEffect(() => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          const image = new Image();
          image.src = SHEET_URL;
          image.onload = () => { imageRef.current = image; };
          let raf = 0;
          let row = -1;
          let started = 0;
          const draw = now => {
            const state = snapshotRef.current?.state || 'idle';
            const meta = ROWS[state] || ROWS.idle;
            if (meta.row !== row) { row = meta.row; started = now; }
            if (image.complete && image.naturalWidth) {
              let frame = Math.floor((now - started) / FRAME_MS);
              frame = meta.loop ? frame % meta.frames : Math.min(frame, meta.frames - 1);
              ctx.clearRect(0, 0, CELL_W, CELL_H);
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(image, frame * CELL_W, meta.row * CELL_H, CELL_W, CELL_H, 0, 0, CELL_W, CELL_H);
            }
            raf = requestAnimationFrame(draw);
          };
          raf = requestAnimationFrame(draw);
          return () => cancelAnimationFrame(raf);
        }, []);

        const state = LABEL[snapshot.state] ? snapshot.state : 'idle';
        const task = snapshot.task && snapshot.task.total > 0 ? snapshot.task : null;
        const taskPercent = task ? Math.round(task.progress * 100) : 0;
        const style = position
          ? { ...rootStyle, left: position.x + 'px', top: position.y + 'px' }
          : { ...rootStyle, right: '22px', bottom: '22px' };

        const beginDrag = event => {
          const rect = event.currentTarget.getBoundingClientRect();
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: rect.left,
            originY: rect.top
          };
          movedRef.current = false;
          event.currentTarget.setPointerCapture?.(event.pointerId);
        };

        const moveDrag = event => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
          const next = clampPosition(drag.originX + dx, drag.originY + dy);
          positionRef.current = next;
          setPosition(next);
        };

        const endDrag = event => {
          if (!dragRef.current) return;
          dragRef.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          if (positionRef.current) savePosition(positionRef.current);
          if (!movedRef.current) setBubble(value => !value);
        };

        if (hidden) {
          return h('button', {
            type: 'button',
            title: '显示 Claude 桌宠',
            onClick: () => setHidden(false),
            style: {
              position: 'fixed',
              right: '22px',
              bottom: '22px',
              zIndex: 2147483000,
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              border: '1px solid rgba(240, 200, 150, .35)',
              background: 'rgba(30, 27, 24, .94)',
              color: '#f7e8d2',
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(0,0,0,.3)'
            }
          }, '◉');
        }

        return h('div', { style, 'data-claude-pet': true },
          bubble && h('div', { style: bubbleStyle, 'data-ui': true },
            h('div', { style: headerStyle },
              h('span', { style: { fontWeight: 700, color: '#f0a269' } }, 'Claude'),
              h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                h('span', { 'aria-hidden': 'true', style: { width: '6px', height: '6px', borderRadius: '50%', background: '#f0a269', display: 'inline-block' } }),
                LABEL[state] ?? state
              )
            ),
            h('div', { style: { marginTop: '7px', fontSize: '12px', lineHeight: 1.5, fontWeight: 600 } }, taskLine(state, task)),
            task && h('div', { style: { marginTop: '7px' } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '10px', color: 'rgba(247,232,210,.62)' } },
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' } }, task.title || '当前任务'),
                h('span', { style: { fontFamily: 'ui-monospace, monospace', color: '#f0a269', whiteSpace: 'nowrap' } }, task.completed + '/' + task.total + ' · ' + taskPercent + '%')
              ),
              h('div', { style: { height: '5px', borderRadius: '999px', background: 'rgba(240,162,105,.2)', marginTop: '5px', overflow: 'hidden' } },
                h('div', { style: { width: taskPercent + '%', height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg,#d96a3c,#e9a14f)' } })
              )
            ),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '5px', marginTop: '7px', opacity: .8 } },
              h('button', { type: 'button', style: buttonStyle, onClick: () => setBubble(false) }, '收起'),
              h('button', { type: 'button', style: buttonStyle, onClick: () => setHidden(true) }, '隐藏')
            )
          ),
          h('div', {
            style: petBoxStyle,
            onPointerDown: beginDrag,
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            title: '拖动我；单击切换气泡'
          },
            h('canvas', { ref: canvasRef, width: CELL_W, height: CELL_H, style: canvasStyle, 'aria-label': 'Claude 桌宠：' + (LABEL[state] ?? state) })
          )
        );
      }

      const name = 'claude-pet';
      const inject = ['slots'];
      function apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'claude-pet-dsh',
          order: 1002
        }, () => h(Pet, {})));
      }

      return { apply, inject, name };
  }
  });
})();
