import os
import time
from dotenv import load_dotenv
import google.generativeai as genai

# Cargar variables de entorno
load_dotenv()

# Obtener keys (las que existen)
API_KEYS = []
if os.getenv("GEMINI_API_KEY"): API_KEYS.append(os.getenv("GEMINI_API_KEY"))
if os.getenv("GEMINI_API_KEY_2"): API_KEYS.append(os.getenv("GEMINI_API_KEY_2"))
if os.getenv("GEMINI_API_KEY_3"): API_KEYS.append(os.getenv("GEMINI_API_KEY_3"))
if os.getenv("GEMINI_API_KEY_4"): API_KEYS.append(os.getenv("GEMINI_API_KEY_4"))
if os.getenv("GEMINI_API_KEY_5"): API_KEYS.append(os.getenv("GEMINI_API_KEY_5"))

# Lista de modelos proporcionada por el usuario
MODELOS = [
    "models/gemini-2.5-flash",
    "models/gemini-2.5-pro",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-001",
    "models/gemini-2.0-flash-exp-image-generation",
    "models/gemini-2.0-flash-lite-001",
    "models/gemini-2.0-flash-lite",
    "models/gemini-2.5-flash-preview-tts",
    "models/gemini-2.5-pro-preview-tts",
    "models/gemma-3-1b-it",
    "models/gemma-3-4b-it",
    "models/gemma-3-12b-it",
    "models/gemma-3-27b-it",
    "models/gemma-3n-e4b-it",
    "models/gemma-3n-e2b-it",
    "models/gemini-flash-latest",
    "models/gemini-flash-lite-latest",
    "models/gemini-pro-latest",
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.5-flash-image",
    "models/gemini-2.5-flash-lite-preview-09-2025",
    "models/gemini-3-pro-preview",
    "models/gemini-3-flash-preview",
    "models/gemini-3.1-pro-preview",
    "models/gemini-3.1-pro-preview-customtools",
    "models/gemini-3.1-flash-lite-preview",
    "models/gemini-3-pro-image-preview",
    "models/nano-banana-pro-preview",
    "models/gemini-3.1-flash-image-preview",
    "models/gemini-robotics-er-1.5-preview",
    "models/gemini-2.5-computer-use-preview-10-2025",
    "models/deep-research-pro-preview-12-2025"
]

def test_models():
    print(f"\\nIniciando test con {len(API_KEYS)} API Keys y {len(MODELOS)} modelos...")
    print("="*60)
    
    modelos_funcionales = []
    
    for modelo_str in MODELOS:
        # Algunos requieren el prefijo models/, probaremos quitándolo para la inicialización
        # de genai si falla, pero genai suele preferir el nombre limpio.
        nombre_limpio = modelo_str.replace("models/", "")
        
        funciona = False
        razon_fallo = "Todas las keys fallaron"
        
        for idx, key in enumerate(API_KEYS):
            genai.configure(api_key=key)
            try:
                # Intentar llamar al modelo con un prompt mínimo
                model = genai.GenerativeModel(nombre_limpio)
                response = model.generate_content("Responde solo con la palabra OK")
                
                if response and "OK" in response.text:
                    print(f"✅ {nombre_limpio:<40} (Key #{idx+1})")
                    modelos_funcionales.append(nombre_limpio)
                    funciona = True
                    break
                else:
                    razon_fallo = "Respuesta extraña"
            except Exception as e:
                err = str(e).lower()
                if "not found" in err or "not supported" in err:
                    razon_fallo = "No existe o no soportado"
                    # Si no existe, no vale la pena probar con las demás keys
                    break
                elif "quota" in err or "429" in err or "exhausted" in err:
                    razon_fallo = "Cuota excedida"
                    # Probar siguiente key
                    continue
                else:
                    razon_fallo = f"Error: {str(e)[:50]}..."
                    continue
                    
        if not funciona:
            print(f"❌ {nombre_limpio:<40} ({razon_fallo})")
            
        # Pausa para no saturar APIs globales base
        time.sleep(1)

    print("\\n" + "="*60)
    print("🏆 MODELOS RECOMENDADOS (ACTUALIZA config.py o ai_responder.py con estos):")
    for m in modelos_funcionales:
        print(f'    "{m}",')
    print("="*60)

if __name__ == "__main__":
    test_models()
