/**
 * ============================================================
 * BUBBLE ANIMATION SYSTEM — Bubble Shop
 * ------------------------------------------------------------
 * Burbujas dinámicas 100% vanilla JS (sin dependencias):
 *  - Nacen bajo el borde inferior del hero
 *  - Se elevan con vaivén horizontal (drift)
 *  - REVIENTAN en un punto aleatorio de la mitad superior
 *    (55% - 90% de la altura del contenedor)
 *  - Estallido: anillo expansivo + 7 gotas que rebotan y caen
 *  - Auto-limpieza al terminar (sin memory leaks)
 *  - Se pausa fuera de viewport / pestaña oculta
 *  - Respeta prefers-reduced-motion
 *  - Recalcula alturas al redimensionar
 * ============================================================
 */

class BubbleSystem {
    /**
     * @param {string} containerSelector selector del contenedor (ej: '.hero-burbujas-fondo')
     * @param {object} options            sobreescribe de la configuración por defecto
     */
    constructor(containerSelector = '.hero-burbujas-fondo', options = {}) {
        this.container = document.querySelector(containerSelector);

        if (!this.container) {
            console.warn(`[BubbleSystem] Contenedor no encontrado: ${containerSelector}`);
            return;
        }

        this.config = {
            minSize: options.minSize ?? 40,
            maxSize: options.maxSize ?? 120,
            minDuration: options.minDuration ?? 5,
            maxDuration: options.maxDuration ?? 8,
            minDelay: options.minDelay ?? 0,
            maxDelay: options.maxDelay ?? 0.8,
            creationInterval: options.creationInterval ?? 650,
            maxBubbles: options.maxBubbles ?? 14,
            colors: options.colors ?? [
                'rgba(255, 255, 255, 0.55)',
                'rgba(6, 182, 212, 0.5)',
                'rgba(56, 189, 248, 0.45)',
                'rgba(30, 64, 175, 0.4)'
            ],
            driftRange: options.driftRange ?? 46,
            /* % de altura (desde abajo) donde puede reventar: mitad superior */
            popPointMin: options.popPointMin ?? 0.55,
            popPointMax: options.popPointMax ?? 0.9
        };

        this.isRunning = false;
        this.isPaused = false;
        this.pausedByView = false;
        this.pausedByVisibility = false;
        this.creationTimer = null;
        this.activeBubbles = new Set();
        this.cleanups = new Map();
        this.bubbleCount = 0;
        this.observer = null;
        this.resizeTimer = null;
        this.lastWidth = window.innerWidth;

        this.handleVisibility = this.handleVisibility.bind(this);
        this.handleResize = this.handleResize.bind(this);
    }

    /* ---------- utilidades ---------- */

    random(min, max) {
        return Math.random() * (max - min) + min;
    }

    isReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /** Tamaños y densidad adaptados al ancho del contenedor */
    getViewportProfile() {
        const w = this.container.clientWidth || window.innerWidth;

        if (w < 375) return { min: 22, max: 56, interval: 950, maxBubbles: 7 };
        if (w < 768) return { min: 28, max: 74, interval: 850, maxBubbles: 9 };
        if (w < 1024) return { min: 34, max: 96, interval: 750, maxBubbles: 12 };
        return { min: 40, max: 120, interval: 650, maxBubbles: 14 };
    }

    /**
     * Calcula las variables CSS de la subida.
     * Coordenadas: translateY positivo = hacia abajo (bajo el borde),
     * negativo = hacia arriba. El centro de la burbuja parte en size/2.
     * @returns {string} cadena de variables CSS
     */
    getRiseVariables(size, popPoint) {
        const height = this.container.clientHeight || 600;

        /* empieza completamente fuera del borde inferior */
        const startY = size + 30;
        /* centro en el % de altura indicado por popPoint */
        let popY = (size / 2) - (height * popPoint);
        /* que no se salga por arriba */
        const maxPopY = -(size / 2) - 8;
        if (popY > maxPopY) popY = maxPopY;

        const at = (percent) => {
            const progress = Math.min(percent / 70, 1); // el pop ocurre al 70% del ciclo
            return (startY + (popY - startY) * progress).toFixed(2) + 'px';
        };

        return `
            --start-y: ${startY.toFixed(2)}px;
            --y-6: ${at(6)};
            --y-12: ${at(12)};
            --y-22: ${at(22)};
            --y-34: ${at(34)};
            --y-46: ${at(46)};
            --y-58: ${at(58)};
            --y-pop: ${popY.toFixed(2)}px;
        `;
    }

    /** Deriva horizontal alternada (vaivén natural) */
    getDriftVariables() {
        const r = this.random(10, this.config.driftRange);
        return `
            --drift-1: ${r.toFixed(1)}px;
            --drift-2: ${(-r * 0.8).toFixed(1)}px;
            --drift-3: ${(r * 0.5).toFixed(1)}px;
            --drift-4: ${(-r * 0.25).toFixed(1)}px;
        `;
    }

    /* ---------- creación ---------- */

    createBubble() {
        if (!this.container || this.activeBubbles.size >= this.getMaxBubbles()) return null;

        const profile = this.getViewportProfile();
        const size = this.random(
            Math.min(this.config.minSize, profile.min) || profile.min,
            Math.max(this.config.maxSize, profile.max)
        );
        const clampedSize = Math.min(size, profile.max);
        const left = this.random(4, 96);
        const duration = this.random(this.config.minDuration, this.config.maxDuration);
        const delay = this.random(this.config.minDelay, this.config.maxDelay);
        const color = this.config.colors[Math.floor(Math.random() * this.config.colors.length)];

        /* punto de estallido dentro de la mitad superior */
        const height = this.container.clientHeight || 600;
        const hardLimit = 1 - (clampedSize / (2 * height)) - 0.03;
        const popPoint = this.random(
            this.config.popPointMin,
            Math.min(this.config.popPointMax, hardLimit)
        );

        const bubble = document.createElement('div');
        bubble.className = 'bubble-flotante-premium';
        bubble.style.cssText = `
            --size: ${clampedSize.toFixed(1)}px;
            --left: ${left.toFixed(2)}%;
            --dur: ${duration.toFixed(2)}s;
            --delay: ${delay.toFixed(2)}s;
            --color: ${color};
            --pop-delay: ${(duration * 0.7).toFixed(2)}s;
            ${this.getRiseVariables(clampedSize, popPoint)}
            ${this.getDriftVariables()}
        `;

        /* cuerpo de vidrio */
        const body = document.createElement('span');
        body.className = 'bubble-body';
        bubble.appendChild(body);

        /* anillo del estallido */
        const ring = document.createElement('span');
        ring.className = 'bubble-ring';
        bubble.appendChild(ring);

        /* 7 gotas */
        for (let i = 0; i < 7; i++) {
            const drop = document.createElement('span');
            drop.className = 'bubble-drop';
            bubble.appendChild(drop);
        }

        /* limpieza automática (la subida es la última animación en terminar) */
        let fallbackTimer;
        const cleanup = () => {
            clearTimeout(fallbackTimer);
            bubble.removeEventListener('animationend', handleAnimationEnd);
            if (bubble.parentNode) bubble.remove();
            this.activeBubbles.delete(bubble);
            this.cleanups.delete(bubble);
        };
        const handleAnimationEnd = (event) => {
            if (event.target !== bubble) return;
            cleanup();
        };

        bubble.addEventListener('animationend', handleAnimationEnd);
        fallbackTimer = setTimeout(cleanup, (delay + duration + 0.5) * 1000);
        this.cleanups.set(bubble, cleanup);

        this.activeBubbles.add(bubble);
        this.bubbleCount++;
        this.container.appendChild(bubble);

        return bubble;
    }

    getMaxBubbles() {
        return Math.min(this.config.maxBubbles, this.getViewportProfile().maxBubbles);
    }

    /* ---------- ciclo de vida ---------- */

    start() {
        if (this.isRunning || !this.container) return;
        if (this.isReducedMotion()) return; // accesibilidad

        this.isRunning = true;

        /* semilla inicial escalonada */
        const seed = Math.min(4, this.getMaxBubbles());
        for (let i = 0; i < seed; i++) {
            setTimeout(() => {
                if (this.isRunning && !this.isPaused) this.createBubble();
            }, i * 350);
        }

        const interval = Math.max(this.config.creationInterval, this.getViewportProfile().interval);
        this.creationTimer = setInterval(() => {
            if (!this.isPaused && this.activeBubbles.size < this.getMaxBubbles()) {
                this.createBubble();
            }
        }, interval);

        this.bindEnvironment();
        console.log('[BubbleSystem] Iniciado', this.getStats());
    }

    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        clearInterval(this.creationTimer);
        this.creationTimer = null;
        this.unbindEnvironment();

        /* cancela timers de limpieza y retira todas las burbujas */
        Array.from(this.activeBubbles).forEach((bubble) => {
            const cleanup = this.cleanups.get(bubble);
            if (cleanup) cleanup();
            else if (bubble.parentNode) bubble.remove();
        });
        this.activeBubbles.clear();
        this.cleanups.clear();
        this.container.classList.remove('is-paused');
        this.isPaused = false;
        this.pausedByView = false;
        this.pausedByVisibility = false;
    }

    restart() {
        this.stop();
        setTimeout(() => this.start(), 120);
    }

    destroy() {
        this.stop();
        if (window.bubbleSystem === this) window.bubbleSystem = null;
    }

    /* ---------- entorno: viewport, visibilidad, resize ---------- */

    bindEnvironment() {
        document.addEventListener('visibilitychange', this.handleVisibility);

        if (!this._resizeBound) {
            window.addEventListener('resize', this.handleResize, { passive: true });
            this._resizeBound = true;
        }

        /* pausar cuando el hero sale de pantalla */
        if ('IntersectionObserver' in window && this.container.parentElement) {
            this.observer = new IntersectionObserver(([entry]) => {
                this.setPausedByView(!entry.isIntersecting);
            }, { threshold: 0 });
            this.observer.observe(this.container.parentElement);
        }
    }

    unbindEnvironment() {
        document.removeEventListener('visibilitychange', this.handleVisibility);
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    handleVisibility() {
        this.pausedByVisibility = document.visibilityState !== 'visible';
        this.syncPaused();
    }

    handleResize = () => {
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            const delta = Math.abs(window.innerWidth - this.lastWidth);
            /* cambios grandes alteran la altura del hero → recalcular */
            if (delta > 80) {
                this.lastWidth = window.innerWidth;
                if (this.isRunning) this.restart();
            }
        }, 300);
    };

    setPausedByView(paused) {
        this.pausedByView = paused;
        this.syncPaused();
    }

    syncPaused() {
        const paused = Boolean(this.pausedByView || this.pausedByVisibility);
        if (this.isPaused === paused) return;
        this.isPaused = paused;
        this.container.classList.toggle('is-paused', paused);
    }

    /* ---------- API pública ---------- */

    createBubbleManual(options = {}) {
        return this.createBubble();
    }

    getStats() {
        return {
            activeBubbles: this.activeBubbles.size,
            maxBubbles: this.getMaxBubbles(),
            totalCreated: this.bubbleCount,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            containerHeight: this.container ? this.container.clientHeight : 0
        };
    }

    updateConfig(newConfig = {}) {
        this.config = { ...this.config, ...newConfig };
        console.log('[BubbleSystem] Config actualizada:', this.config);
    }
}

/* ---------- auto-inicialización ---------- */
document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const container = document.querySelector('.hero-burbujas-fondo');
    if (container && !window.bubbleSystem) {
        /* la página puede sobreescribir la configuración con window.BUBBLE_CONFIG */
        const bubbleSystem = new BubbleSystem('.hero-burbujas-fondo', {
            minSize: 40,
            maxSize: 120,
            minDuration: 5,
            maxDuration: 8,
            minDelay: 0,
            maxDelay: 0.9,
            creationInterval: 650,
            maxBubbles: 14,
            colors: [
                'rgba(255, 255, 255, 0.55)',
                'rgba(6, 182, 212, 0.5)',
                'rgba(56, 189, 248, 0.45)',
                'rgba(30, 64, 175, 0.4)'
            ],
            driftRange: 46,
            popPointMin: 0.55,
            popPointMax: 0.9,
            ...(window.BUBBLE_CONFIG || {})
        });

        bubbleSystem.start();
        window.bubbleSystem = bubbleSystem;
    }
});

/* export opcional (bundlers) */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BubbleSystem;
}
