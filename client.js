;(() => {
  window.__ModuleLoader__.load({
    id: 'claude-pet-dsh',
    factory: (require) => {
      const React = require('react');
      const { useEffect, useRef, useState } = React;
      const h = React.createElement;

      const BASE = '/claude-pet-dsh';
      const STATE_URL = BASE + '/state';
      const ART_URL = BASE + '/assets/svg/';
      const POS_KEY = 'claude-pet-dsh.position.v2';

      // Artwork geometry: every Clawd SVG uses viewBox="-15 -25 45 45", with the
      // character body sitting around x 0..15, y 6..16. We crop a window out of
      // that canvas and scale it, so the transparent padding never becomes an
      // invisible click target and animated accessories above the head stay in view.
      const VIEW = { x: -15, y: -25, w: 45, h: 45 };
      const CROP = { x: -6, y: -9, w: 23, h: 28 };
      const SCALE = 7;
      const PET_W = Math.round(CROP.w * SCALE);
      const PET_H = Math.round(CROP.h * SCALE);
      const IMG_W = VIEW.w * SCALE;
      const IMG_H = VIEW.h * SCALE;
      const IMG_LEFT = Math.round((VIEW.x - CROP.x) * SCALE);
      const IMG_TOP = Math.round((VIEW.y - CROP.y) * SCALE);
      const HEAD_TOP = Math.round((4.5 - CROP.y) * SCALE);
      const EDGE = 8;

      const ART = {
        idle: 'clawd-mini-idle.svg',
        working: 'clawd-working-typing.svg',
        waiting: 'clawd-mini-peek.svg',
        complete: 'clawd-happy.svg',
        error: 'clawd-error.svg',
        connecting: 'clawd-wake.svg',
        offline: 'clawd-sleeping.svg',
        dragging: 'clawd-react-drag.svg'
      };

      // Minimized form: a small Clawd peeking from the corner, using the mini art.
      const MINI = {
        idle: 'clawd-mini-idle.svg',
        working: 'clawd-mini-typing.svg',
        waiting: 'clawd-mini-peek.svg',
        complete: 'clawd-mini-happy.svg',
        error: 'clawd-mini-alert.svg',
        connecting: 'clawd-mini-enter.svg',
        offline: 'clawd-mini-sleep.svg'
      };

      const MINI_CROP = { x: -2, y: -5, w: 19, h: 23 };
      const MINI_W = 60;
      const MINI_SCALE = MINI_W / MINI_CROP.w;
      const MINI_H = Math.round(MINI_CROP.h * MINI_SCALE);
      const MINI_IMG_W = Math.round(VIEW.w * MINI_SCALE);
      const MINI_IMG_LEFT = Math.round((VIEW.x - MINI_CROP.x) * MINI_SCALE);
      const MINI_IMG_TOP = Math.round((VIEW.y - MINI_CROP.y) * MINI_SCALE);

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

      const bubbleStyle = {
        position: 'absolute',
        width: '250px',
        padding: '10px 12px 9px',
        border: '1px solid rgba(240, 200, 150, .28)',
        borderRadius: '14px',
        background: 'rgba(30, 27, 24, .94)',
        color: '#f7e8d2',
        boxShadow: '0 12px 30px rgba(0, 0, 0, .3)',
        backdropFilter: 'blur(10px)',
        fontFamily: '"Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif',
        pointerEvents: 'auto'
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

      const buttonStyle = {
        border: '1px solid rgba(240, 200, 150, .28)',
        borderRadius: '999px',
        background: 'transparent',
        color: '#f7e8d2',
        cursor: 'pointer',
        font: '11px/1.2 "Microsoft YaHei UI", sans-serif',
        padding: '3px 8px'
      };

      const miniButtonStyle = {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        width: MINI_W + 'px',
        height: MINI_H + 'px',
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: 2147483000,
        filter: 'drop-shadow(0 4px 9px rgba(0, 0, 0, .3))'
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

      function clampPosition(value) {
        const maxX = Math.max(EDGE, window.innerWidth - PET_W - EDGE);
        const maxY = Math.max(EDGE, window.innerHeight - PET_H - EDGE);
        return {
          x: Math.min(Math.max(EDGE, value.x), maxX),
          y: Math.min(Math.max(EDGE, value.y), maxY)
        };
      }

      function defaultPosition() {
        return clampPosition({
          x: window.innerWidth - PET_W - 8,
          y: window.innerHeight - PET_H - 12
        });
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
        const [dragging, setDragging] = useState(false);
        const [position, setPosition] = useState(() => clampPosition(loadPosition() ?? defaultPosition()));
        const positionRef = useRef(position);
        const dragRef = useRef(null);
        const movedRef = useRef(false);
        positionRef.current = position;

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
          const onResize = () => setPosition(current => clampPosition(current));
          window.addEventListener('resize', onResize);
          return () => window.removeEventListener('resize', onResize);
        }, []);

        const beginDrag = event => {
          if (event.button !== undefined && event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin: positionRef.current
          };
          movedRef.current = false;
          setDragging(true);
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
          if (event.preventDefault) event.preventDefault();
        };

        const moveDrag = event => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
          const next = clampPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy });
          positionRef.current = next;
          setPosition(next);
        };

        const endDrag = event => {
          const drag = dragRef.current;
          if (!drag) return;
          dragRef.current = null;
          setDragging(false);
          try { event.currentTarget.releasePointerCapture(drag.pointerId); } catch {}
          if (movedRef.current) savePosition(positionRef.current);
          else setBubble(value => !value);
        };

        const state = LABEL[snapshot.state] ? snapshot.state : 'idle';

        if (hidden) {
          return h('button', {
            type: 'button',
            title: '展开 Claude 桌宠',
            'aria-label': '展开 Claude 桌宠',
            'data-mini-pet': true,
            onClick: () => setHidden(false),
            style: miniButtonStyle
          },
            h('div', { style: { position: 'absolute', inset: 0, overflow: 'hidden' } },
              h('img', {
                src: ART_URL + (MINI[state] ?? MINI.idle),
                alt: 'Claude 桌宠（最小化）',
                draggable: false,
                'data-art': MINI[state] ?? MINI.idle,
                style: {
                  position: 'absolute',
                  left: MINI_IMG_LEFT + 'px',
                  top: MINI_IMG_TOP + 'px',
                  width: MINI_IMG_W + 'px',
                  height: MINI_IMG_W + 'px',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }
              })
            )
          );
        }

        const task = snapshot.task && snapshot.task.total > 0 ? snapshot.task : null;
        const taskPercent = task ? Math.round(task.progress * 100) : 0;
        const art = dragging ? ART.dragging : (ART[state] ?? ART.idle);
        const bubbleBelow = position.y < 240;
        const bubbleAlign = position.x < 250
          ? { left: '0px' }
          : { right: '0px' };
        const bubbleVertical = bubbleBelow
          ? { top: (PET_H + 2) + 'px' }
          : { bottom: (PET_H - HEAD_TOP + 8) + 'px' };

        return h('div', {
          'data-claude-pet': true,
          'data-state': state,
          style: {
            position: 'fixed',
            left: position.x + 'px',
            top: position.y + 'px',
            width: PET_W + 'px',
            height: PET_H + 'px',
            zIndex: 2147483000,
            pointerEvents: 'none',
            userSelect: 'none'
          }
        },
          bubble && h('div', { style: { ...bubbleStyle, ...bubbleAlign, ...bubbleVertical }, 'data-ui': true },
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
            'data-pet-drag': 'true',
            title: '拖动我；单击切换气泡',
            onPointerDown: beginDrag,
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            style: {
              position: 'absolute',
              inset: 0,
              pointerEvents: 'auto',
              touchAction: 'none',
              cursor: dragging ? 'grabbing' : 'grab'
            }
          },
            h('div', {
              style: {
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                filter: 'drop-shadow(0 8px 10px rgba(0, 0, 0, .28))'
              }
            },
              h('img', {
                src: ART_URL + art,
                alt: 'Claude 桌宠：' + (LABEL[state] ?? state),
                draggable: false,
                'data-art': art,
                style: {
                  position: 'absolute',
                  left: IMG_LEFT + 'px',
                  top: IMG_TOP + 'px',
                  width: IMG_W + 'px',
                  height: IMG_H + 'px',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }
              })
            )
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
