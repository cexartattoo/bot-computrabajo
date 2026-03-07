from bs4 import BeautifulSoup
import json

with open("sample_job.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

# Find the main container
container = soup.select_one("article.box_detail, main .box_detail, .box_detail")
print(f"Container found: {'Yes' if container else 'No'}")
if container:
    print(f"Container classes: {container.get('class')}")
    print(f"Container tag: {container.name}")
    
    # Try to find specific elements within the container
    title = container.select_one("h1")
    print(f"Title: {title.text.strip() if title else 'Not found'}")
    
    company = container.select_one("a.dIB.fs16, .box_detail h1 + p a, .company_name") # guess
    if not company:
        # Let's just find the first link under h1 or similar
        ps = container.select("p")
        for p in ps[:3]:
            if p.select_one("a"):
                company = p.select_one("a")
                break
    print(f"Company: {company.text.strip() if company else 'Not found'}")
    
    # Find tags
    tags = container.select(".tag, .fs13.mt15 span, .box_tags span, li, p span")
    print("\nPotential tags/badges:")
    for t in tags[:20]:
        text = t.text.strip()
        if text and len(text) < 100:
            print(f"- {text}")
            
    # Look for description text specifically
    desc = container.select_one(".fc_base, .fs16, .mbB, p.mbB")
    print(f"\nDesc snippet: {desc.text.strip()[:100]}..." if desc else "Desc not found by .fc_base")

    # Let's print all text of the container to figure out what it includes
    print(f"\nTotal length of container inner raw text: {len(container.get_text(separator=' ', strip=True))}")
    print("Does it contain 'Novedades'? ", "Novedades" in container.get_text())

else:
    # If not found, what is the structure?
    main = soup.find("main")
    if main:
        print("Classes on main:", main.get("class"))
        for child in main.find_all(recursive=False):
            print("Main child:", child.name, child.get("class"))
