import sys
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        # Using the exact job mentioned by the user
        await page.goto("https://co.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-ingeniero-electrico-proyectos-de-infraestructura-electrica-csj-en-bogota-d-c-3AEC06059AD7F8A161373E686DCF3405")
        await page.wait_for_timeout(3000)
        content = await page.content()
        with open("sample_job.html", "w", encoding="utf-8") as f:
            f.write(content)
        await browser.close()
        print("Done downloading sample_job.html")

if __name__ == "__main__":
    asyncio.run(main())
