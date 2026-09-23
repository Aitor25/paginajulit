// Helpers para extraer el id de vídeo de YouTube a partir de una URL, en
// cualquiera de sus formas: youtu.be/{id}, youtube.com/watch?v={id} y
// youtube.com/shorts/{id}. Compartido entre la biblioteca de ejercicios y el
// constructor de entrenamientos para no duplicar la misma lógica dos veces.

export function extractYouTubeId(videoUrl) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1) || null;
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] || null;
      }
      return url.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

// Un Short es un vídeo vertical: se reproduce en una caja 9:16 en vez de la
// habitual 16:9, para no dejarlo con bandas negras enormes a los lados.
export function isYouTubeShorts(videoUrl) {
  if (!videoUrl) return false;
  try {
    return new URL(videoUrl).pathname.startsWith('/shorts/');
  } catch {
    return false;
  }
}

export function getYouTubeThumbnail(videoUrl) {
  const videoId = extractYouTubeId(videoUrl);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}

export function getYouTubeEmbedUrl(videoUrl) {
  const videoId = extractYouTubeId(videoUrl);
  return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1` : null;
}
