import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width":1280,"height":1800})
        page.on('pageerror',lambda e: print('PAGE ERROR',str(e)))
        await page.goto('http://localhost:8080')
        result = await page.evaluate('''async () => {
          const {startHost} = await import('/src/lib/broadcast.ts');
          const camera = document.createElement('canvas'); camera.width=1280; camera.height=720;
          const ctx=camera.getContext('2d'); ctx.fillStyle='rgb(220,30,30)'; ctx.fillRect(0,0,1280,720);
          const paint=setInterval(()=>{ctx.fillStyle='rgb(220,30,30)';ctx.fillRect(0,0,1280,720);},33); const stream=camera.captureStream(30);
          const host=startHost('shot-check-'+crypto.randomUUID(),stream,{2:'test2',3:'test3'},()=>{},()=>{});
          const video=document.createElement('video'); video.muted=true; video.srcObject=host.previewStream;
          document.body.appendChild(video); video.style.width='640px'; await video.play();
          const wait=()=>new Promise(r=>setTimeout(r,400));
          const sample=()=>{const c=document.createElement('canvas'); c.width=1280;c.height=720;const x=c.getContext('2d');x.drawImage(video,0,0);return Array.from(x.getImageData(10,10,1,1).data);};
          await wait();const initial=sample();
          const slide={text:'For God so loved the world',reference:'John 3:16',imageUrl:''};
          await host.showVerse(slide);await wait();const bible=sample();
          await host.useCamera(1);await wait();const restored=sample();
          await host.showVerse(slide);await wait();const recalled=sample();
          const pending=host.showVerse(slide);await host.useCamera(1);await pending;await wait();const race=sample();
          let unavailable=false;try{await host.useCamera(2);}catch{unavailable=true;}
          const unchanged=sample();
          await host.finishRecording();host.stop();clearInterval(paint);stream.getTracks().forEach(t=>t.stop());
          return {initial,bible,restored,recalled,race,unavailable,unchanged};
        }''')
        print(result)
        assert result['initial'][0]>180
        assert result['bible'][0]<50
        assert result['restored'][0]>180
        assert result['recalled'][0]<50
        assert result['race'][0]>180
        assert result['unavailable'] and result['unchanged'][0]>180
        await page.screenshot(path='/tmp/browser/shot-switch/camera-restored.png')
        await browser.close()
asyncio.run(main())
