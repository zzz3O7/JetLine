from playwright.sync_api import sync_playwright
html = open('dist/jetline.html').read()
page_html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">' + html + '</body></html>'
three = open('node_modules/three/build/three.module.min.js').read()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    for vp, name in [({'width': 1280, 'height': 720}, 'desk'), ({'width': 844, 'height': 390}, 'phone')]:
        ctx = b.new_context(viewport=vp, has_touch=(name=='phone'), is_mobile=(name=='phone'))
        pg = ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text))
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        pg.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=three))
        pg.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
        pg.route('http://local/', lambda r: r.fulfill(status=200, content_type='text/html', body=page_html))
        pg.goto('http://local/')
        pg.wait_for_timeout(1500)
        if name == 'phone':
            pg.screenshot(path='dist/smoke-phone-start.png')
        # start the run, then jump to the last gate area and drive to the finish
        pg.keyboard.down('KeyW'); pg.wait_for_timeout(300)
        pg.evaluate('''() => { const J = window.JC, t = __jetline.track, r = __jetline.race; r.next = t.gates.length - 1;
          const bx = t.boxes.filter(x => x.piece === 24)[0];
          const g = { p: J.M.add(bx.c, J.M.mul(bx.ax[1], 1)), f: bx.ax[2], u: bx.ax[1], r: bx.ax[0] };
          const s = t.spawnFor(g); __jetline.car.reset(s.pos, s.q, 30); }''')
        for _ in range(30):
            pg.wait_for_timeout(300)
            if pg.evaluate('__jetline.race.finished'): break
        pg.keyboard.up('KeyW')
        pg.wait_for_timeout(500)
        pg.screenshot(path=f'dist/smoke-{name}.png')
        print(name, pg.evaluate('({fin: __jetline.race.finished, t: __jetline.race.time, best: localStorage.getItem("jetline:best:Sky Strip") ? "saved" : "none"})'))
        print('\n'.join(logs[:10]))
        ctx.close()
    b.close()
