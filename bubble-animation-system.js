/**
 * Bubble Animation System - Premium Dynamic Bubbles
 * 
 * Características:
 * - Burbujas infinitas y dinámicas (no estáticas)
 * - Tamaños aleatorios (40-120px)
 * - Posiciones X aleatorias (0-100% viewport)
 * - Velocidades aleatorias (2.5-4.5s)
 * - Pop effect con 7 gotas cayendo
 * - Auto-eliminación al terminar animación (sin memory leak)
 * - Máximo 12 burbujas simultáneas
 * - 100% vanilla JS, sin dependencias
 * - GPU accelerated (CSS animations)
 */

class BubbleSystem {
    /**
     * @param {string} containerSelector - Selector CSS del contenedor (ej: '.hero-burbujas-fondo')
     * @param {Object} options - Configuración del sistema
     */
    constructor(containerSelector, options = {}) {
        this.container = document.querySelector(containerSelector);
        
        if (!this.container) {
            console.warn(`[BubbleSystem] Contenedor no encontrado: ${containerSelector}`);
            return;
        }
        
        // Configuración por defecto (optimizada para Bubble Shop)
        this.config = {
            minSize: options.minSize ?? 40,
            maxSize: options.maxSize ?? 120,
            minDuration: options.minDuration ?? 5,
            maxDuration: options.maxDuration ?? 8,
            minDelay: options.minDelay ?? 0,
            maxDelay: options.maxDelay ?? 0.8,
            creationInterval: options.creationInterval ?? 600,
            maxBubbles: options.maxBubbles ?? 15,
            colors: options.colors ?? [
                'rgba(6, 182, 212, 0.5)',     // Cian principal
                'rgba(30, 64, 175, 0.4)',      // Azul profundo
                'rgba(184, 216, 240, 0.45)',   // Azul suave
                'rgba(255, 255, 255, 0.3)'     // Blanco translúcido
            ],
            driftRange: options.driftRange ?? 50, // px de deriva horizontal
            popPointMin: options.popPointMin ?? 50,  // % mínimo donde revienta (50% = mitad)
            popPointMax: options.popPointMax ?? 95  // % máximo donde revienta (95% = cerca del tope)
        };
        
        this.isRunning = false;
        this.creationTimer = null;
        this.activeBubbles = new Set();
        this.bubbleCount = 0;
        
        // Exponer globalmente para debugging
        window.bubbleSystem = this;
    }
    
    /**
     * Genera un número aleatorio entre min y max
     */
    random(min, max) {
        return Math.random() * (max - min) + min;
    }

    getRiseOffsets(popPoint, approachPoint, duration) {
        const containerHeight = this.container.clientHeight;
        // Y positions (translateY): positive = down (below), negative = up (above)
        // Start 150px below container bottom
        const startY = 150;
        // Progress percentages of container height
        const yAt = (percent) => startY - (containerHeight * percent / 100);
        // Pop point in pixels from bottom
        const popY = yAt(popPoint);
        // Approach point (slightly below pop)
        const approachY = yAt(approachPoint);
        // Pop delay at ~68% of duration
        const popDelay = duration * 0.68;

        return `
            --start-y: ${startY}px;
            --y-5: ${yAt(5)}px;
            --y-10: ${yAt(10)}px;
            --y-25: ${yAt(25)}px;
            --y-40: ${yAt(40)}px;
            --y-55: ${yAt(55)}px;
            --y-pop: ${popY}px;
            --y-end: ${popY - 80}px;
            --pop-delay: ${popDelay}s;
        `;
    }
    
    /**
     * Crea una burbuja individual con propiedades aleatorias
     */
    createBubble() {
        if (!this.container || this.activeBubbles.size >= this.config.maxBubbles) {
            return null;
        }
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble-flotante-premium';
        
        // Propiedades aleatorias
        const size = this.random(this.config.minSize, this.config.maxSize);
        const left = this.random(5, 95); // % viewport, margen 5%
        const duration = this.random(this.config.minDuration, this.config.maxDuration);
        const delay = this.random(this.config.minDelay, this.config.maxDelay);
        const color = this.config.colors[Math.floor(Math.random() * this.config.colors.length)];
        
        // Punto aleatorio donde revienta (entre 50% y 95% del contenedor)
        const popPoint = this.random(this.config.popPointMin, this.config.popPointMax);
        const approachPoint = popPoint * 0.8;
        
        // Derivas aleatorias para movimiento natural
        const drift1 = this.random(-this.config.driftRange, this.config.driftRange);
        const drift2 = this.random(-this.config.driftRange, this.config.driftRange);
        const drift3 = this.random(-this.config.driftRange, this.config.driftRange);
        const drift4 = this.random(-this.config.driftRange, this.config.driftRange);
        
        // Aplicar variables CSS
        bubble.style.cssText = `
            --size: ${size}px;
            --left: ${left}%;
            --dur: ${duration}s;
            --delay: ${delay}s;
            --color: ${color};
            --pop-point: ${popPoint}%;
            --approach-point: ${approachPoint}%;
            --bubble-delay: ${delay}s;
            --pop-delay: ${duration * 0.68}s;
            ${this.getRiseOffsets(popPoint, approachPoint, duration)}
            --drift-1: ${drift1}px;
            --drift-2: ${drift2}px;
            --drift-3: ${drift3}px;
            --drift-4: ${drift4}px;
            left: ${left}%;
            width: ${size}px;
            height: ${size}px;
        `;
        
        // Crear 7 gotas para el efecto pop
        for (let i = 0; i < 7; i++) {
            const drop = document.createElement('div');
            drop.className = 'bubble-drop';
            bubble.appendChild(drop);
        }
        
        // Auto-eliminación cuando termina la animación
        // La animación dura --dur segundos, más un pequeño buffer
        const cleanupTime = (duration + delay + 0.5) * 1000;
        
        const cleanup = () => {
            if (bubble.parentNode) {
                bubble.remove();
            }
            this.activeBubbles.delete(bubble);
        };

        let fallbackTimer;
        const handleAnimationEnd = (event) => {
            if (event.target !== bubble) return;

            clearTimeout(fallbackTimer);
            cleanup();
        };

        bubble.addEventListener('animationend', handleAnimationEnd);
        fallbackTimer = setTimeout(() => {
            bubble.removeEventListener('animationend', handleAnimationEnd);
            cleanup();
        }, cleanupTime);
        
        // Registrar burbuja activa
        this.activeBubbles.add(bubble);
        this.bubbleCount++;
        
        // Agregar al contenedor
        this.container.appendChild(bubble);
        
        return bubble;
    }
    
    /**
     * Inicia el sistema de creación continua
     */
    start() {
        if (this.isRunning || !this.container) return;
        
        this.isRunning = true;
        
        // Crear burbujas iniciales (staggered)
        const initialCount = Math.min(3, this.config.maxBubbles);
        for (let i = 0; i < initialCount; i++) {
            setTimeout(() => this.createBubble(), i * 200);
        }
        
        // Loop continuo de creación
        this.creationTimer = setInterval(() => {
            if (this.activeBubbles.size < this.config.maxBubbles) {
                this.createBubble();
            }
        }, this.config.creationInterval);
        
        console.log('[BubbleSystem] Iniciado', this.getStats());
    }
    
    /**
     * Detiene el sistema
     */
    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        if (this.creationTimer) {
            clearInterval(this.creationTimer);
            this.creationTimer = null;
        }
        
        // Limpiar burbujas existentes
        this.activeBubbles.forEach(bubble => {
            if (bubble.parentNode) {
                bubble.remove();
            }
        });
        this.activeBubbles.clear();
        
        console.log('[BubbleSystem] Detenido');
    }
    
    /**
     * Reinicia el sistema (stop + start)
     */
    restart() {
        this.stop();
        // Pequeño delay para asegurar limpieza
        setTimeout(() => this.start(), 100);
    }
    
    /**
     * Crea una burbuja manualmente (para eventos especiales)
     */
    createBubbleManual(options = {}) {
        if (!this.container) return null;
        
        const bubble = document.createElement('div');
        bubble.className = 'bubble-flotante-premium';
        
        const size = options.size ?? this.random(this.config.minSize, this.config.maxSize);
        const left = options.left ?? this.random(5, 95);
        const duration = options.duration ?? this.random(this.config.minDuration, this.config.maxDuration);
        const color = options.color ?? this.config.colors[Math.floor(Math.random() * this.config.colors.length)];
        const popPoint = options.popPoint ?? this.random(this.config.popPointMin, this.config.popPointMax);
        
        const drift1 = this.random(-this.config.driftRange, this.config.driftRange);
        const drift2 = this.random(-this.config.driftRange, this.config.driftRange);
        const drift3 = this.random(-this.config.driftRange, this.config.driftRange);
        const drift4 = this.random(-this.config.driftRange, this.config.driftRange);
        
        bubble.style.cssText = `
            --size: ${size}px;
            --left: ${left}%;
            --dur: ${duration}s;
            --delay: 0s;
            --color: ${color};
            --pop-point: ${popPoint}%;
            --approach-point: ${popPoint * 0.8}%;
            --bubble-delay: 0s;
            --pop-delay: ${duration * 0.68}s;
            ${this.getRiseOffsets(popPoint, popPoint * 0.8, duration)}
            --drift-1: ${drift1}px;
            --drift-2: ${drift2}px;
            --drift-3: ${drift3}px;
            --drift-4: ${drift4}px;
            left: ${left}%;
            width: ${size}px;
            height: ${size}px;
        `;
        
        for (let i = 0; i < 7; i++) {
            const drop = document.createElement('div');
            drop.className = 'bubble-drop';
            bubble.appendChild(drop);
        }
        
        const cleanup = () => {
            if (bubble.parentNode) bubble.remove();
            this.activeBubbles.delete(bubble);
        };

        let fallbackTimer;
        const handleAnimationEnd = (event) => {
            if (event.target !== bubble) return;

            clearTimeout(fallbackTimer);
            cleanup();
        };

        bubble.addEventListener('animationend', handleAnimationEnd);
        fallbackTimer = setTimeout(() => {
            bubble.removeEventListener('animationend', handleAnimationEnd);
            cleanup();
        }, (duration + 0.5) * 1000);
        
        this.activeBubbles.add(bubble);
        this.container.appendChild(bubble);
        
        return bubble;
    }
    
    /**
     * Obtiene estadísticas del sistema
     */
    getStats() {
        return {
            activeBubbles: this.activeBubbles.size,
            maxBubbles: this.config.maxBubbles,
            totalCreated: this.bubbleCount,
            isRunning: this.isRunning,
            creationInterval: this.config.creationInterval,
            config: { ...this.config }
        };
    }
    
    /**
     * Actualiza configuración en tiempo real
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[BubbleSystem] Config actualizada:', this.config);
    }
    
    /**
     * Destruye completamente el sistema
     */
    destroy() {
        this.stop();
        window.bubbleSystem = null;
    }
}

// Auto-inicialización si existe el contenedor
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.hero-burbujas-fondo');
    if (container && !window.bubbleSystem) {
        // Configuración por defecto para Bubble Shop
        const bubbleSystem = new BubbleSystem('.hero-burbujas-fondo', {
            minSize: 40,
            maxSize: 120,
            minDuration: 5,
            maxDuration: 8,
            minDelay: 0,
            maxDelay: 0.8,
            creationInterval: 600,
            maxBubbles: 15,
            colors: [
                'rgba(6, 182, 212, 0.5)',
                'rgba(30, 64, 175, 0.4)',
                'rgba(184, 216, 240, 0.45)',
                'rgba(255, 255, 255, 0.3)'
            ],
            driftRange: 50,
            popPointMin: 50,
            popPointMax: 95
        });
        
        bubbleSystem.start();
    }
});

// Exportar para uso modular (si se usa con bundlers)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BubbleSystem;
}