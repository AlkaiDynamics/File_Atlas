// themeManager.js - Manages application-wide theming and color schemes
import { EventEmitter } from 'events';

class ThemeManager extends EventEmitter {
    constructor() {
        super();
        this.currentTheme = 'light';
        this.themes = {
            light: {
                name: 'Light',
                colors: {
                    background: '#f5f5f5',
                    surface: '#ffffff',
                    primary: '#3498db',
                    secondary: '#2ecc71',
                    accent: '#e74c3c',
                    text: '#2c3e50',
                    textSecondary: '#7f8c8d',
                    border: '#bdc3c7',
                    shadow: 'rgba(0, 0, 0, 0.1)',
                    nodeColors: {
                        root: '#fd8d3c',
                        directory: '#31a354',
                        file: '#756bb1',
                        protected: '#a1a1a1'
                    }
                }
            },
            dark: {
                name: 'Dark',
                colors: {
                    background: '#1a1a1a',
                    surface: '#2d2d2d',
                    primary: '#3498db',
                    secondary: '#2ecc71',
                    accent: '#e74c3c',
                    text: '#ecf0f1',
                    textSecondary: '#bdc3c7',
                    border: '#34495e',
                    shadow: 'rgba(0, 0, 0, 0.3)',
                    nodeColors: {
                        root: '#ff7f50',
                        directory: '#2ecc71',
                        file: '#9b59b6',
                        protected: '#95a5a6'
                    }
                }
            }
        };

        this.init();
    }

    init() {
        // Load saved theme preference or detect system preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.setTheme(savedTheme);
        } else {
            this.setTheme(this.detectSystemTheme());
        }

        // Listen for system theme changes
        this.watchSystemTheme();
    }

    detectSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    watchSystemTheme() {
        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', e => {
                if (!localStorage.getItem('theme')) {
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
    }

    setTheme(themeName) {
        if (!this.themes[themeName]) {
            console.error(`Theme ${themeName} not found`);
            return;
        }

        this.currentTheme = themeName;
        localStorage.setItem('theme', themeName);

        // Apply theme colors to CSS variables
        const theme = this.themes[themeName];
        const root = document.documentElement;

        Object.entries(theme.colors).forEach(([key, value]) => {
            if (typeof value === 'object') {
                Object.entries(value).forEach(([subKey, subValue]) => {
                    root.style.setProperty(`--${key}-${subKey}`, subValue);
                });
            } else {
                root.style.setProperty(`--${key}`, value);
            }
        });

        // Update body class for theme-specific styles
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(`theme-${themeName}`);

        // Emit theme change event
        this.emit('themeChanged', themeName);
    }

    getCurrentTheme() {
        return this.themes[this.currentTheme];
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    // Add custom theme
    addTheme(name, colors) {
        this.themes[name] = {
            name,
            colors: { ...this.themes.light.colors, ...colors }
        };
    }
}

export default new ThemeManager();