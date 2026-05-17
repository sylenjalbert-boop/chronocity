/* ============================================================
   CLARITY OVERLAY — non-destructive readability layer
   Adds: top banner, action-category chips, free-actions rail,
         first-run tutorial, help button, on/off toggle.
   Hooks into existing functions WITHOUT replacing them.
   ============================================================ */
(function () {
    'use strict';

    const LS_TUTORIAL = 'clarity_tutorial_seen_v1';
    const LS_ENABLED  = 'clarity_enabled_v1';

    function buildActionDock() {
        const d = document.createElement('div');
        d.id = 'clarity-action-dock';
        d.innerHTML = `
            <button class="cad-btn" data-action="tile">
                <span class="cad-ico">🗺</span><span class="cad-label">Révéler une tuile</span>
            </button>
            <button class="cad-btn" data-action="build">
                <span class="cad-ico">🏗</span><span class="cad-label">Construire</span>
            </button>
            <button class="cad-btn" data-action="tax">
                <span class="cad-ico">💰</span><span class="cad-label">Percevoir l'impôt</span>
            </button>
        `;
        return d;
    }

    function buildActionPopover() {
        const p = document.createElement('div');
        p.id = 'clarity-action-popover';
        p.innerHTML = `
            <div class="cap-header">
                <span class="cap-title" id="cap-title">—</span>
                <button class="cap-close" id="cap-close" title="Fermer">×</button>
            </div>
            <div class="cap-body" id="cap-body"></div>
        `;
        return p;
    }

    let currentAction = null;
    const SECTION_IDS  = { tile: 'sec-tile',  build: 'sec-build', tax: 'sec-tax' };
    const ACTION_TITLES = {
        tile:  '🗺 Révéler une tuile',
        build: '🏗 Construire un bâtiment',
        tax:   '💰 Percevoir l\'impôt',
    };

    function openActionPanel(action) {
        if (actionSpent || actionBusy || pendingNext) return; // can't act
        if (currentAction === action) { closeActionPanel(); return; }
        if (currentAction) closeActionPanel(true);
        const sec = document.getElementById(SECTION_IDS[action]);
        const body = document.getElementById('cap-body');
        const pop  = document.getElementById('clarity-action-popover');
        const title = document.getElementById('cap-title');
        if (!sec || !body || !pop) return;
        body.appendChild(sec);
        sec.style.display = 'flex';
        pop.classList.add('open');
        if (title) title.textContent = ACTION_TITLES[action] || '';
        currentAction = action;
        document.querySelectorAll('#clarity-action-dock .cad-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.action === action);
        });
    }

    function closeActionPanel(skipFade) {
        if (!currentAction) return;
        const sec = document.getElementById(SECTION_IDS[currentAction]);
        const bar = document.getElementById('action-bar');
        if (sec && bar) bar.appendChild(sec);
        currentAction = null;
        if (!skipFade) {
            const pop = document.getElementById('clarity-action-popover');
            if (pop) pop.classList.remove('open');
            document.querySelectorAll('#clarity-action-dock .cad-btn.active')
                    .forEach(b => b.classList.remove('active'));
        }
    }

    // ---------- on/off ----------
    // Forced ON permanently — the legacy layout is retired.
    function isEnabled() { return true; }
    function setEnabled(_on) {
        document.body.classList.add('clarity-on');
        document.body.classList.remove('clarity-off');
    }

    // ---------- state tracking ----------
    let actionSpent = false;   // main action of this turn consumed
    let actionBusy  = false;   // animation in progress
    let pendingNext = false;   // a main action ran; nextTurn deferred until user clicks End Turn
    let origNextRef = null;    // original nextTurn (pre-wrap)
    let lastTurn    = -1;
    let lastSeason  = -1;

    function readTurn() {
        const n = parseInt(document.getElementById('currentTurn')?.textContent, 10);
        return isNaN(n) ? (window.currentTurn || 1) : n;
    }
    function readSeason() {
        const n = parseInt(document.getElementById('saison')?.textContent, 10);
        return isNaN(n) ? (window.currentSeason || 1) : n;
    }
    // turnProcessing is `let`-scoped in the game's script (not on window).
    // Proxy via the body class that setTurnProcessing() toggles.
    function isTurnProcessing() {
        return document.body.classList.contains('processing');
    }

    // ---------- inject UI ----------
    function buildBanner() {
        const bar = document.createElement('div');
        bar.id = 'clarity-banner';
        bar.innerHTML = `
            <span class="cb-turn" id="cb-turn">Tour 1 / Saison 1</span>
            <span class="cb-threat" id="cb-threat" style="display:none"></span>
            <span class="cb-sep"></span>
            <span class="cb-instr">
                Choisis <b>1 action principale</b> ce tour (Révéler · Construire · Impôts).
                Les actions <b style="color:#80c0ff">gratuites</b> (recruter, équiper, sort, donjon) ne consomment pas ton tour.
            </span>
            <span class="cb-status" id="cb-status"></span>
            <button class="cb-help" id="cb-help" title="Revoir le tutoriel">?</button>
        `;
        return bar;
    }

    function buildFreeRail() {
        const r = document.createElement('div');
        r.id = 'clarity-free-rail';
        r.innerHTML = `
            <span class="cfr-label">🔵 Gratuit</span>
            <button class="cfr-btn" data-target="recruit">
                <span class="cfr-ico">⚔</span> Recruter
            </button>
            <button class="cfr-btn" data-target="equip">
                <span class="cfr-ico">🛡</span> Équiper
            </button>
            <button class="cfr-btn" data-target="army">
                <span class="cfr-ico">🏰</span> Mon armée
            </button>
            <button class="cfr-btn" data-target="horde">
                <span class="cfr-ico">👹</span> La horde
            </button>
            <button class="cfr-btn cfr-dungeon" data-target="dungeon" id="cfr-dungeon" style="display:none">
                <span class="cfr-ico">🐉</span> Explorer le donjon
            </button>
            <span class="cfr-spacer"></span>
            <button class="cfr-toggle" id="cfr-toggle">
                <span id="cfr-toggle-text">Clarté : ON</span>
            </button>
        `;
        return r;
    }

    function chip(text, cls) {
        const c = document.createElement('div');
        c.className = 'clarity-chip ' + cls;
        c.textContent = text;
        return c;
    }

    function injectChips() {
        const tile  = document.getElementById('sec-tile');
        const build = document.getElementById('sec-build');
        const tax   = document.getElementById('sec-tax');
        [tile, build, tax].forEach(el => {
            if (el && !el.querySelector('.clarity-chip')) {
                el.appendChild(chip('🟡 1 ACTION', 'cc-action'));
            }
        });
    }

    function buildResBar() {
        const r = document.createElement('div');
        r.id = 'clarity-resbar';
        r.innerHTML = `
            <div class="crb-group crb-eco">
                <div class="crb-grp-label">💰 Économie</div>
                <div class="crb-row" title="Or — gagné par les Impôts. Sert à construire et recruter.">
                    <span class="crb-ico">🪙</span>
                    <span class="crb-name">Or</span>
                    <span class="crb-val" id="crb-gold">—</span>
                    <span class="crb-delta" id="crb-gold-d"></span>
                </div>
                <div class="crb-row" title="Mana — gagné par certains bâtiments. Sert aux sorts.">
                    <span class="crb-ico">✨</span>
                    <span class="crb-name">Mana</span>
                    <span class="crb-val" id="crb-mana">—</span>
                    <span class="crb-delta" id="crb-mana-d"></span>
                </div>
                <div class="crb-row" title="Population — habitants de ta cité. Sert à recruter.">
                    <span class="crb-ico">👥</span>
                    <span class="crb-name">Population</span>
                    <span class="crb-val" id="crb-pop">—</span>
                    <span class="crb-delta" id="crb-pop-d"></span>
                </div>
            </div>
            <div class="crb-group crb-city">
                <div class="crb-grp-label">🏰 Cité</div>
                <div class="crb-row crb-stat" title="Fortifications — ajoutées à la défense lors de l'assaut de la horde.">
                    <span class="crb-ico">🏰</span>
                    <span class="crb-name">Fortifications</span>
                    <span class="crb-val" id="crb-fort">—</span>
                </div>
                <div class="crb-row crb-stat" title="Conscrits — soldats recrutés et prêts à défendre.">
                    <span class="crb-ico">⚔</span>
                    <span class="crb-name">Conscrits</span>
                    <span class="crb-val" id="crb-cons">—</span>
                </div>
                <div class="crb-row crb-stat" title="Slots libres — emplacements disponibles pour construire.">
                    <span class="crb-ico">🏗</span>
                    <span class="crb-name">Slots libres</span>
                    <span class="crb-val" id="crb-space">—</span>
                </div>
            </div>
            <div class="crb-group crb-avatar">
                <div class="crb-grp-label">🧙 Avatar</div>
                <div class="crb-row crb-stat" title="Points de vie de ton avatar.">
                    <span class="crb-ico">❤</span>
                    <span class="crb-name">PV</span>
                    <span class="crb-val" id="crb-hp">—</span>
                </div>
                <div class="crb-row crb-stat" title="Attaque de l'avatar (équipement + base).">
                    <span class="crb-ico">⚔</span>
                    <span class="crb-name">Attaque</span>
                    <span class="crb-val" id="crb-atk">—</span>
                </div>
                <div class="crb-row crb-stat" title="Défense de l'avatar (équipement + base).">
                    <span class="crb-ico">🛡</span>
                    <span class="crb-name">Défense</span>
                    <span class="crb-val" id="crb-def">—</span>
                </div>
            </div>
        `;
        return r;
    }

    function renderResBar() {
        const setVal = (id, srcId) => {
            const dst = document.getElementById(id);
            const src = document.getElementById(srcId);
            if (dst && src) dst.textContent = src.textContent.trim() || '—';
        };
        setVal('crb-gold', 'res-gold');
        setVal('crb-mana', 'res-mana');
        setVal('crb-pop',  'res-pop');
        setVal('crb-fort', 'res-fort');
        setVal('crb-cons', 'res-conscrit');
        setVal('crb-space','res-space');
        setVal('crb-hp',   'res-hp');
        setVal('crb-atk',  'res-atk');
        setVal('crb-def',  'res-def');

        // Deltas (gain/turn) from hidden spans
        const setDelta = (id, srcId) => {
            const dst = document.getElementById(id);
            const src = document.getElementById(srcId);
            if (!dst || !src) return;
            const v = parseInt(src.textContent, 10);
            if (isNaN(v) || v === 0) { dst.textContent = ''; return; }
            dst.textContent = (v > 0 ? '+' : '') + v + '/t';
            dst.classList.toggle('neg', v < 0);
        };
        setDelta('crb-gold-d', 'goldperturn');
        setDelta('crb-mana-d', 'manaperturn');
        setDelta('crb-pop-d',  'populationperturn');
    }

    // ---------- horde threat indicator ----------
    function readNum(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        const n = parseInt(el.textContent, 10);
        return isNaN(n) ? null : n;
    }
    function computeThreat() {
        const turn = readTurn();
        const cityPow = readNum('city-power-total') || 0;
        const hordeTxt = document.getElementById('horde-power-total')?.textContent.trim();
        const hordePow = hordeTxt && hordeTxt !== '?' ? parseInt(hordeTxt, 10) : null;
        const fort = readNum('fortifications') || 0;
        const totalDef = cityPow + fort;
        const turnsLeft = Math.max(0, 10 - turn);
        let outcome = 'unknown';
        if (hordePow !== null && hordePow > 0) {
            const ratio = totalDef / hordePow;
            if (ratio >= 1.2) outcome = 'win';
            else if (ratio >= 0.85) outcome = 'doubt';
            else outcome = 'lose';
        }
        return { turn, turnsLeft, totalDef, hordePow, outcome };
    }
    function renderThreat() {
        const el = document.getElementById('cb-threat');
        if (!el) return;
        const t = computeThreat();
        el.style.display = 'inline-flex';
        el.classList.toggle('imminent', t.turnsLeft <= 2);

        let html = '<span>⚔ Horde dans</span> <span class="ct-countdown">' + t.turnsLeft + '</span><span>tour' + (t.turnsLeft===1?'':'s') + '</span>';
        if (t.hordePow !== null) {
            const cls = t.outcome === 'win' ? 'ok' : (t.outcome === 'doubt' ? 'warn' : 'bad');
            html += '<span class="ct-vs">·</span>'
                  + '<span>Toi <b class="ct-num ' + cls + '">' + t.totalDef + '</b></span>'
                  + '<span class="ct-vs">vs</span>'
                  + '<span>Horde <b class="ct-num bad">' + t.hordePow + '</b></span>';
        } else if (t.turn >= 1) {
            html += '<span class="ct-vs">· révélée au tour 5</span>';
        }
        el.innerHTML = html;
    }

    // ---------- big threat preview after turn popup ----------
    function showThreatPreview() {
        const t = computeThreat();
        if (t.turn >= 10) return; // skip on battle turn

        // Build big floating card
        const big = document.createElement('div');
        big.id = 'clarity-threat-big';
        big.classList.add('outcome-' + t.outcome);

        const oTitle = {
            win:   '✅ Victoire assurée',
            doubt: '⚖ Combat incertain',
            lose:  '☠ Défaite probable',
            unknown: '👁 Horde non révélée',
        }[t.outcome];
        const oSub = {
            win:   'Ton armée devrait écraser la horde.',
            doubt: 'Le combat sera serré — renforce-toi.',
            lose:  'Tu vas perdre. Recrute, construis, prie.',
            unknown: 'La compo de la horde sera dévoilée au tour 5.',
        }[t.outcome];

        big.innerHTML = `
            <div class="ctb-countdown">
                <span class="ctb-label">⚔ Horde dans</span>
                <span class="ctb-num">${t.turnsLeft}</span>
                <span class="ctb-label">tour${t.turnsLeft===1?'':'s'}</span>
            </div>
            ${t.hordePow !== null ? `
                <div class="ctb-vs">
                    <div class="ctb-side ctb-you">
                        <div class="ctb-side-label">Ta défense</div>
                        <div class="ctb-side-val">${t.totalDef}</div>
                    </div>
                    <div class="ctb-vs-sep">VS</div>
                    <div class="ctb-side ctb-horde">
                        <div class="ctb-side-label">Horde</div>
                        <div class="ctb-side-val">${t.hordePow}</div>
                    </div>
                </div>
            ` : `
                <div class="ctb-hidden">?  ?  ?</div>
            `}
            <div class="ctb-verdict">${oTitle}</div>
            <div class="ctb-sub">${oSub}</div>
        `;
        document.body.appendChild(big);

        // After dwell, fly to small pill position
        const dwell = 1200;
        setTimeout(() => {
            const target = document.getElementById('cb-threat');
            if (!target) { big.classList.add('fade-out'); setTimeout(() => big.remove(), 400); return; }
            const tRect = target.getBoundingClientRect();
            const bRect = big.getBoundingClientRect();

            // Compute scale to roughly match the small pill width
            const scale = Math.max(0.12, tRect.width / bRect.width);
            const dx = (tRect.left + tRect.width / 2) - (bRect.left + bRect.width / 2);
            const dy = (tRect.top + tRect.height / 2) - (bRect.top + bRect.height / 2);
            big.style.transition = 'transform 0.7s cubic-bezier(.5,0,.3,1), opacity 0.55s ease';
            big.style.transform  = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale})`;
            big.style.opacity    = '0';
            setTimeout(() => big.remove(), 750);
        }, dwell);
    }

    // ---------- watch turn-overlay close to trigger threat preview ----------
    let _threatObserver = null;
    function installTurnOverlayWatch() {
        if (_threatObserver) return;
        const ovl = document.getElementById('turn-overlay');
        if (!ovl) return;
        let wasShown = ovl.classList.contains('show');
        _threatObserver = new MutationObserver(() => {
            const isShown = ovl.classList.contains('show');
            if (wasShown && !isShown) {
                // popup just closed → show threat preview if clarity is on
                if (document.body.classList.contains('clarity-on')) {
                    setTimeout(showThreatPreview, 150);
                }
            }
            wasShown = isShown;
        });
        _threatObserver.observe(ovl, { attributes: true, attributeFilter: ['class'] });
    }

    // ---------- dungeon availability ----------
    function updateDungeonButton() {
        const btn = document.getElementById('cfr-dungeon');
        if (!btn) return;
        const turn = readTurn();
        const exploreTurns = [1, 3, 7, 9];
        const avatarBlocked = window.avatarBlocked === true;
        const available = exploreTurns.includes(turn) && !avatarBlocked && !pendingNext;
        btn.style.display = available ? '' : 'none';
    }

    // ---------- status pill ----------
    function renderStatus() {
        const s = document.getElementById('cb-status');
        const t = document.getElementById('cb-turn');
        if (!s || !t) return;
        const turn = readTurn();
        const season = readSeason();
        t.textContent = `Tour ${turn} / 10 · Saison ${season}`;

        let actionLabel, actionCls;
        if (turn === 10) {
            actionLabel = '⚔ COMBAT DE HORDE';
            actionCls   = 'action-busy';
        } else if (actionBusy) {
            actionLabel = '⏳ Action en cours…';
            actionCls   = 'action-busy';
        } else if (actionSpent) {
            actionLabel = '✓ Action prise';
            actionCls   = 'action-spent';
        } else {
            actionLabel = '○ Action disponible';
            actionCls   = 'action-avail';
        }

        const showEndTurn = pendingNext && !actionBusy && turn !== 10;
        s.innerHTML = `
            <span class="cb-pill ${actionCls}">🟡 ${actionLabel}</span>
            <span class="cb-pill free">🔵 Gratuit dispo</span>
            ${showEndTurn ? '<button class="cb-endturn" id="cb-endturn">▶ Fin du tour</button>' : ''}
        `;
        if (showEndTurn) {
            const btn = document.getElementById('cb-endturn');
            if (btn) btn.addEventListener('click', endTurn);
        }

        document.body.classList.toggle('clarity-spent', actionSpent || actionBusy);
        renderThreat();
        updateDungeonButton();
        renderResBar();
    }

    // ---------- end-turn handler ----------
    function endTurn() {
        if (!pendingNext) return;
        pendingNext = false;
        actionBusy = true;
        renderStatus();
        if (window.setTurnProcessing) window.setTurnProcessing(true);
        // Call the original (unwrapped) nextTurn so it actually advances
        if (origNextRef) origNextRef.apply(window);
        else if (window.nextTurn && window.nextTurn.__clarityRealCall) {
            window.nextTurn.__clarityRealCall();
        }
    }

    // ---------- hooks into existing game logic ----------
    function installHooks() {
        // nextTurn → consumed an action; reset spent on new turn
        const origNext = window.nextTurn;
        if (typeof origNext === 'function' && !origNext.__clarityWrapped) {
            origNextRef = origNext;
            const wrapped = function () {
                // If a main action just ran and Clarté is ON, defer turn advance
                // until the user clicks End Turn. Free actions remain available.
                if (pendingNext && document.body.classList.contains('clarity-on')) {
                    actionBusy = false;
                    // unlock the UI so the player can use free actions
                    // (mirror what nextTurn would have done at its end)
                    document.body.classList.remove('processing');
                    if (window.setTurnProcessing) {
                        try { window.setTurnProcessing(false); } catch(e){}
                    }
                    renderStatus();
                    return; // deferred
                }
                const r = origNext.apply(this, arguments);
                actionSpent = false;
                actionBusy  = false;
                pendingNext = false;
                renderStatus();
                return r;
            };
            wrapped.__clarityWrapped = true;
            wrapped.__clarityRealCall = () => origNext.apply(window);
            window.nextTurn = wrapped;
        }

        // doRevealTile → main action
        const origReveal = window.doRevealTile;
        if (typeof origReveal === 'function' && !origReveal.__clarityWrapped) {
            window.doRevealTile = function () {
                const before = isTurnProcessing();
                const r = origReveal.apply(this, arguments);
                if (!before && isTurnProcessing()) {
                    actionSpent = true; actionBusy = true; pendingNext = true; closeActionPanel(); renderStatus();
                }
                return r;
            };
            window.doRevealTile.__clarityWrapped = true;
        }

        // buyBuilding → main action (only counts when accepted)
        const origBuy = window.buyBuilding;
        if (typeof origBuy === 'function' && !origBuy.__clarityWrapped) {
            window.buyBuilding = function () {
                const beforeProc = isTurnProcessing();
                const r = origBuy.apply(this, arguments);
                if (!beforeProc && isTurnProcessing()) {
                    actionSpent = true; actionBusy = true; pendingNext = true; closeActionPanel(); renderStatus();
                }
                return r;
            };
            window.buyBuilding.__clarityWrapped = true;
        }

        // doTaxAndClose → main action
        const origTax = window.doTaxAndClose;
        if (typeof origTax === 'function' && !origTax.__clarityWrapped) {
            window.doTaxAndClose = function () {
                const before = isTurnProcessing();
                const r = origTax.apply(this, arguments);
                if (!before && isTurnProcessing()) {
                    actionSpent = true; actionBusy = true; pendingNext = true; closeActionPanel(); renderStatus();
                }
                return r;
            };
            window.doTaxAndClose.__clarityWrapped = true;
        }
    }

    // ---------- poll for state drift ----------
    function pollLoop() {
        const t = readTurn();
        const s = readSeason();
        if (t !== lastTurn || s !== lastSeason) {
            lastTurn = t; lastSeason = s;
            actionSpent = false;
            actionBusy = false;
            renderStatus();
        } else {
            const busyNow = isTurnProcessing();
            if (busyNow !== actionBusy) {
                actionBusy = busyNow;
                renderStatus();
            }
        }
        // Always refresh the resource strip + threat (cheap, values change between turns)
        renderResBar();
        renderThreat();
        updateDungeonButton();
    }

    // ---------- tutorial ----------
    const TUTORIAL_STEPS = [
        {
            title: 'Bienvenue à Chronocity',
            body: `
                <p>Tu diriges une cité menacée par la <b>Horde</b>. Tu as <b>10 tours</b> par saison pour la préparer.</p>
                <div class="ct-rule r-battle">
                    <span class="ct-rule-ic">⚔</span>
                    <div>Au <b>tour 10</b>, la Horde attaque ta ville. Si tu perds, tu recommences (avec des bonus).</div>
                </div>
            `,
        },
        {
            title: 'Le rythme d\'un tour',
            body: `
                <div class="ct-rule r-action">
                    <span class="ct-rule-ic">🟡</span>
                    <div>Chaque tour, choisis <b>1 action principale</b> parmi 3 :
                    <br>· <b>🗺 Révéler</b> une tuile · <b>🏗 Construire</b> un bâtiment · <b>💰 Impôts</b> (récolter)</div>
                </div>
                <div class="ct-rule r-free">
                    <span class="ct-rule-ic">🔵</span>
                    <div>Tu peux aussi faire des <b>actions gratuites</b> sans limite : <b>recruter</b> des troupes, <b>équiper</b> ton avatar, <b>acheter</b> dans les bâtiments, ou <b>entrer dans le donjon</b> (quand disponible).</div>
                </div>
                <p style="font-size:12px;color:#9a8a6a">Le bandeau en haut t'indique en permanence : <b>🟡 action dispo / prise</b> et les options 🔵 gratuites.</p>
            `,
        },
        {
            title: 'Ce que tu construis sert au combat',
            body: `
                <p>Chaque <b>tuile révélée</b> rejoint ta ville et offre des emplacements de bâtiments.</p>
                <p>Les <b>bâtiments</b> donnent : ressources (or, mana, pop), fortifications, ou débloquent le recrutement (Caserne → unités, Académie → unités d'élite).</p>
                <p>Au tour 10, <b>ton armée + tes fortifications</b> affrontent la Horde. Préparez-la !</p>
                <div class="ct-rule r-battle">
                    <span class="ct-rule-ic">👁</span>
                    <div>La composition de la Horde se <b>révèle au tour 5</b>. Adapte ta défense en conséquence.</div>
                </div>
            `,
        },
    ];

    let tutStep = 0;
    function showTutorial(force) {
        if (!force && localStorage.getItem(LS_TUTORIAL) === '1') return;
        tutStep = 0;
        const overlay = document.createElement('div');
        overlay.id = 'clarity-tutorial';
        overlay.innerHTML = `
            <div class="ct-card">
                <div class="ct-step" id="ct-step-label"></div>
                <div class="ct-title" id="ct-title"></div>
                <div class="ct-body" id="ct-body"></div>
                <div class="ct-actions">
                    <button class="ct-btn secondary" id="ct-skip">Passer</button>
                    <div class="ct-dots" id="ct-dots"></div>
                    <button class="ct-btn" id="ct-next">Suivant ▶</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const renderStep = () => {
            const s = TUTORIAL_STEPS[tutStep];
            overlay.querySelector('#ct-step-label').textContent = `ÉTAPE ${tutStep+1} / ${TUTORIAL_STEPS.length}`;
            overlay.querySelector('#ct-title').textContent = s.title;
            overlay.querySelector('#ct-body').innerHTML = s.body;
            const dots = overlay.querySelector('#ct-dots');
            dots.innerHTML = TUTORIAL_STEPS.map((_, i) =>
                `<div class="ct-dot ${i === tutStep ? 'active' : ''}"></div>`
            ).join('');
            overlay.querySelector('#ct-next').textContent =
                tutStep === TUTORIAL_STEPS.length - 1 ? 'Commencer ✓' : 'Suivant ▶';
        };

        const close = () => {
            overlay.remove();
            localStorage.setItem(LS_TUTORIAL, '1');
        };

        overlay.querySelector('#ct-skip').onclick = close;
        overlay.querySelector('#ct-next').onclick = () => {
            if (tutStep < TUTORIAL_STEPS.length - 1) {
                tutStep++; renderStep();
            } else {
                close();
            }
        };

        renderStep();
    }

    // ---------- free-rail handlers ----------
    function openRecruitModal() {
        let modal = document.getElementById('clarity-recruit-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'clarity-recruit-modal';
            modal.innerHTML = `
                <div class="crm-backdrop"></div>
                <div class="crm-card">
                    <div class="crm-header">
                        <span class="crm-title">⚔ Recruter des troupes</span>
                        <button class="crm-close" type="button">×</button>
                    </div>
                    <div class="crm-body" id="crm-body"></div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('.crm-close').addEventListener('click', () => modal.classList.remove('open'));
            modal.querySelector('.crm-backdrop').addEventListener('click', () => modal.classList.remove('open'));
        }
        const body = modal.querySelector('#crm-body');
        body.innerHTML = '';
        if (typeof window.renderRecruitListIn === 'function') {
            window.renderRecruitListIn(body);
        } else {
            body.textContent = 'Recrutement indisponible.';
        }
        modal.classList.add('open');

        // Re-render the list each time an action happens (recruit / dismiss).
        // The game's recruitUnit() calls renderActionArmyTab() which targets a
        // different container, so we observe DOM mutations on body for clicks.
        body.addEventListener('click', () => {
            // small delay to let game logic run, then refresh
            setTimeout(() => {
                if (modal.classList.contains('open')) {
                    body.innerHTML = '';
                    if (typeof window.renderRecruitListIn === 'function') window.renderRecruitListIn(body);
                }
            }, 50);
        }, { once: false });
    }

    function onFreeAction(target) {
        switch (target) {
            case 'recruit':
                openRecruitModal();
                break;
            case 'equip':
                if (typeof window.openEquipWindow === 'function') window.openEquipWindow();
                break;
            case 'army':
                if (typeof window.openArmyModal === 'function') window.openArmyModal('city');
                break;
            case 'horde':
                if (typeof window.openArmyModal === 'function') window.openArmyModal('horde');
                break;
            case 'dungeon':
                // Dungeon is a FREE action — do NOT advance the turn at exit.
                if (typeof window.showPreDungeonWindow === 'function'
                        && typeof window.openDungeon === 'function') {
                    window.showPreDungeonWindow(() => {
                        window.openDungeon(() => { /* no nextTurn — free action */ });
                    });
                }
                break;
        }
    }

    // ---------- boot ----------
    function boot() {
        // top of body — banner
        const banner = buildBanner();
        const rail   = buildFreeRail();
        const resbar = buildResBar();

        // Insert before timeline if present, else at top
        const tl = document.getElementById('timeline');
        if (tl && tl.parentNode) {
            tl.parentNode.insertBefore(banner, tl);
            tl.parentNode.insertBefore(resbar, tl.nextSibling);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
            document.body.insertBefore(resbar, banner.nextSibling);
        }

        injectChips();

        // === Flanking rails: FREE actions LEFT, PAID actions RIGHT, grid CENTER ===
        const dock = buildActionDock();
        const mcr  = document.getElementById('main-content-row');
        const gameArea = document.getElementById('game-area');
        if (mcr && gameArea) {
            mcr.insertBefore(rail, gameArea);        // free actions LEFT
            mcr.insertBefore(dock, gameArea.nextSibling); // paid actions RIGHT
        } else {
            document.body.appendChild(rail);
            document.body.appendChild(dock);
        }
        dock.querySelectorAll('.cad-btn').forEach(b => {
            b.addEventListener('click', () => openActionPanel(b.dataset.action));
        });

        const popover = buildActionPopover();
        document.body.appendChild(popover);
        popover.querySelector('#cap-close').addEventListener('click', () => closeActionPanel());

        // wire free-rail buttons
        rail.querySelectorAll('.cfr-btn').forEach(b => {
            b.addEventListener('click', () => onFreeAction(b.dataset.target));
        });
        rail.querySelector('#cfr-toggle').addEventListener('click', () => {
            setEnabled(!isEnabled());
        });

        // help button
        banner.querySelector('#cb-help').addEventListener('click', () => showTutorial(true));

        // always-visible floating toggle (so user can re-enable when OFF)
        const floatBtn = document.createElement('button');
        floatBtn.id = 'clarity-floating-toggle';
        floatBtn.innerHTML = '✨ <span id="cft-text">Clarté ON</span>';
        floatBtn.title = 'Activer/désactiver le calque de clarté';
        floatBtn.addEventListener('click', () => {
            setEnabled(!isEnabled());
            document.getElementById('cft-text').textContent = isEnabled() ? 'Clarté ON' : 'Clarté OFF';
        });
        document.body.appendChild(floatBtn);

        // initial toggle state
        setEnabled(isEnabled());

        // hooks + initial render
        installHooks();
        installTurnOverlayWatch();
        renderStatus();

        // re-hook periodically (some game scripts reassign globals)
        setInterval(() => {
            installHooks();
            installTurnOverlayWatch();
            pollLoop();
        }, 400);

        // first-run tutorial
        setTimeout(() => showTutorial(false), 800);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        // Game's own DOMContentLoaded runs first; wait a tick to let it finish.
        setTimeout(boot, 100);
    }
})();
