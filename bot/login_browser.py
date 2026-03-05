import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    print("Iniciando navegador persistente...")
    user_data_dir = Path(__file__).parent / "playwright_data"
    
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,  # Siempre mostramos la interfaz
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        )
        
        pages = context.pages
        page = pages[0] if len(pages) > 0 else await context.new_page()
        
        print("\n" + "="*60)
        print("NAVEGADOR ABIERTO - INSTRUCCIONES:")
        print("1. El navegador se está abriendo ahora.")
        print("2. Inicia sesión en Computrabajo con tu cuenta (Google o normal).")
        print("3. Resuelve cualquier captcha si te lo piden.")
        print("4. Navega hasta que veas tu perfil de candidato.")
        print("5. Cuando termines, simplemente cierra la ventana del navegador.")
        print("="*60 + "\n")
        
        await page.goto("https://www.computrabajo.com.co/candidato/login")
        
        # Esperamos a que el navegador se cierre (context.wait_for_event("close") o similar no funciona tan fácil,
        # así que hacemos un loop esperando a que no hayan páginas)
        try:
            while len(context.pages) > 0:
                await asyncio.sleep(1)
        except Exception:
            pass
            
        print("\nNavegador cerrado. Sesión guardada en 'playwright_data'.")
        print("Ya puedes ejecutar el bot normalmente.")

if __name__ == "__main__":
    asyncio.run(main())
