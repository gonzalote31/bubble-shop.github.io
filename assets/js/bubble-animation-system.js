/**
 * 🫧 BUBBLE ANIMATION SYSTEM - OPTIMIZADO
 * 
 * Features:
 * - Burbujas dinámicas infinitas
 * - Tamaños aleatorios (40-120px)
 * - Posiciones X aleatorias
 * - Velocidades aleatorias (2-4s)
 * - Auto-eliminación al salir de pantalla
 * - Max 10 burbujas simultáneamente
 * - Sin memory leaks
 */

class BubbleSystem {
    constructor(containerSelector = '.hero-burbujas-fondo', options = {}) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) {
            console.warn(`Container ${containerSelector} not found`);
            return;
        }

        // Configuración
        this.config = {
            minSize: options.minSize || 40,
            maxSize: options.maxSize || 120,
            minDuration: options.minDuration || 2,
            maxDuration: options.maxDuration || 4,
            minDelay: options.minDelay || 0,
            maxDelay: options.maxDelay || 0.5,
            creationInterval: options.creationInterval || 600, // ms
            maxBubbles: options.maxBubbles || 10,
            colors: options.colors || ['rgba(6, 182, 212, 0.4)', 'rgba(30, 64, 175, 0.3)', 'rgba(184, 216, 240, 0.35)']
        };

        this.activeBubbles = new Set();
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Inicia el sistema de burbujas
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.createInitialBubbles();
        
        // Crear nuevas burbujas cada X ms
        this.intervalId = setInterval(() => {
            if (this.activeBubbles.size < this.config.maxBubbles) {
                this.createBubble();
            }
        }, this.config.creationInterval);

        console.log('🫧 Bubble System started');
    }

    /**
     * Detiene el sistema
     */
    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        clearInterval(this.intervalId);
        
        // Eliminar todas las burbujas
        this.activeBubbles.forEach(bubble => bubble.remove());
        this.activeBubbles.clear();

        console.log('🫧 Bubble System stopped');
    }

    /**
     * Crea burbujas iniciales
     */
    createInitialBubbles() {
        const initialCount = Math.min(3, this.config.maxBubbles);
        for (let i = 0; i < initialCount; i++) {
            this.createBubble();
        }
    }

    /**
     * Crea una burbuja individual
     */
    createBubble() {
        const size = this.randomBetween(this.config.minSize, this.config.maxSize);
        const duration = this.randomBetween(this.config.minDuration, this.config.maxDuration);
        const delay = this.randomBetween(this.config.minDelay, this.config.maxDelay);
        const left = Math.random() * 100;
        const color = this.config.colors[Math.floor(Math.random() * this.config.colors.length)];

        // Crear elemento burbuja principal
        const bubble = document.createElement('div');
        bubble.className = 'bubble-flotante-premium';
        bubble.style.cssText = `
            --size: ${size}px;
            --duration: ${duration}s;
            --delay: ${delay}s;
            --left: ${left}%;
            --color: ${color};
            width: ${size}px;
            height: ${size}px;
            left: ${left}%;
            animation: bubbleFloatUp ${duration}s linear ${delay}s forwards;
        `;

        // Crear brillo (shine)
        const shine = document.createElement('div');
        shine.className = 'bubble-shine';
        bubble.appendChild(shine);

        // Crear gotas decorativas (7 gotas)
        const dropsContainer = document.createElement('div');
        dropsContainer.className = 'bubble-drops-container';
        bubble.appendChild(dropsContainer);

        for (let i = 0; i < 7; i++) {
            const drop = document.createElement('div');
            drop.className = 'bubble-drop';
            drop.style.cssText = `
                --drop-index: ${i};
                transform: translate(-50%, -${size * 0.5}px) rotate(${(360 / 7) * i}deg);
            `;
            dropsContainer.appendChild(drop);
        }

        // Listener para eliminar cuando acaba la animación
        const handleAnimationEnd = () => {
            bubble.removeEventListener('animationend', handleAnimationEnd);
            bubble.remove();
            this.activeBubbles.delete(bubble);
        };

        bubble.addEventListener('animationend', handleAnimationEnd);

        // Agregar al DOM
        this.container.appendChild(bubble);
        this.activeBubbles.add(bubble);

        return bubble;
    }

    /**
     * Utilidad: número aleatorio entre min y max
     */
    randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    /**
     * Obtener stats del sistema
     */
    getStats() {
        return {
            activeBubbles: this.activeBubbles.size,
            isRunning: this.isRunning,
            maxBubbles: this.config.maxBubbles,
            creationInterval: this.config.creationInterval
        };
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Iniciar sistema de burbujas
    const bubbleSystem = new BubbleSystem('.hero-burbujas-fondo', {
        minSize: 40,
        maxSize: 120,
        minDuration: 2.5,
        maxDuration: 4.5,
        minDelay: 0,
        maxDelay: 0.8,
        creationInterval: 600,
        maxBubbles: 12,
        colors: [
            'rgba(6, 182, 212, 0.5)',    // Cian
            'rgba(30, 64, 175, 0.4)',     // Azul profundo
            'rgba(184, 216, 240, 0.45)',  // Azul suave
            'rgba(255, 255, 255, 0.3)'    // Blanco translúcido
        ]
    });

    bubbleSystem.start();

    // Opcional: Exponer globalmente para debug
    window.bubbleSystem = bubbleSystem;
});
