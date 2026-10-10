/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./*.html", "./app.js"],
    theme: {
        extend: {
            colors: {
                matn: {
                    emerald: '#234e3d',
                    emeraldDark: '#173629',
                    emeraldLight: '#2f6751',
                    gold: '#c5a059',
                    goldLight: '#dfbe7e',
                    cream: '#fcf9f3',
                    creamDark: '#f2ece0',
                    sand: '#e8dec8',
                    charcoal: '#1c2421',
                    muted: '#5a6b63',
                    olive: '#48521f',
                    oliveDark: '#343b14',
                    oliveLight: '#6d7c33'
                }
            },
            fontFamily: {
                amiri: ['Amiri', 'serif'],
                cairo: ['Cairo', 'sans-serif'],
                ruqaa: ['"Aref Ruqaa"', 'serif']
            }
        }
    }
}
