#!/bin/bash
# Cambiar al directorio donde está el script
cd "$(dirname "$0")"

echo "Iniciando servidor local de previsualización..."
echo "Por favor, mantén esta ventana abierta mientras uses la aplicación."

# Abrir el navegador en el puerto de previsualización de Vite
sleep 1 && open "http://localhost:4173" &

# Ejecutar el servidor de previsualización en el puerto 4173
npx vite preview --port 4173
