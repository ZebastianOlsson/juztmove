"""Bygger index.html (det som GitHub Pages visar) från src/index.src.html.
Kör från repots rot:  python src/build.py
Passbiblioteket byggs aldrig in – det laddas från användarens eget Supabase-konto."""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
src = (root / 'src' / 'index.src.html').read_text(encoding='utf-8')
head = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/favicon-32.png?v=7">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=7">
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png?v=7">
<meta name="apple-mobile-web-app-title" content="JuztMove">
<meta name="apple-mobile-web-app-status-bar-style" content="default">'''
out = (src.replace('__PUBLIC_HEAD__', head)
          .replace('__LIBRARY__', '{"programs":[],"workouts":[]}')
          .replace('__BUILD__', 'public'))
(root / 'index.html').write_text(out, encoding='utf-8')
print('index.html byggd,', len(out), 'tecken')
