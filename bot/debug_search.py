import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    print("Iniciando navegador persistente para debug...")
    user_data_dir = Path(__file__).parent.parent / "playwright_data"
    
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        )
        await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        pages = context.pages
        page = pages[0] if len(pages) > 0 else await context.new_page()
        
        print("Navegando a home...")
        await page.goto("https://co.computrabajo.com/")
        await asyncio.sleep(5)
        
        print("Buscando el header en el DOM...")
        html = await page.content()
        with open("debug_page.html", "w", encoding="utf-8") as f:
            f.write(html)
            
        print("HTML guardado en debug_page.html")
        await context.close()

if __name__ == "__main__":
    asyncio.run(main())
