import { jsPDF } from 'jspdf';
import { storage, KEYS } from '../services/storage';
import { formatDate } from './dateUtils';

// Paleta calcada de las variables de la app (--accent, grises, ámbar de las
// notas) para que el PDF no desentone del resto de la interfaz.
const ACCENT = [79, 70, 229];
const ACCENT_LIGHT = [238, 242, 255];
const ACCENT_DARK = [55, 48, 163];
const GRAY_900 = [17, 24, 39];
const GRAY_500 = [107, 114, 128];
const GRAY_400 = [156, 163, 175];
const GRAY_300 = [209, 213, 219];
const BORDER = [229, 231, 235];
const NOTES_BG = [255, 251, 235];
const NOTES_BORDER = [245, 158, 11];
const NOTES_TEXT = [75, 85, 99];

const PAGE_MARGIN_X = 15;
const COL_WIDTHS = { num: 8, exercise: 50, target: 32, rest: 16 };

function formatObjetivo(ex) {
  const reps = (ex.plannedReps ?? '').toString().trim();
  const repsPart = /^\d+$/.test(reps) ? `${reps} reps` : (reps || '—');
  const hasLoad = ex.loadValue !== null && ex.loadValue !== undefined && ex.loadValue !== '';
  return hasLoad ? `${repsPart} @ ${ex.loadValue} ${ex.loadUnit || ''}`.trim() : repsPart;
}

function formatDescanso(ex) {
  return ex.restSeconds ? `${ex.restSeconds} s` : '—';
}

// Encabezado + franja de marca. Se repite igual en cada PDF generado.
function drawBrandHeader(doc, { coachName }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFillColor(...ACCENT);
  doc.roundedRect(PAGE_MARGIN_X, y - 5.5, 8, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('FC', PAGE_MARGIN_X + 4, y - 1.1, { align: 'center' });

  doc.setFontSize(11.5);
  doc.setTextColor(...ACCENT);
  doc.text('FitCoachPro', PAGE_MARGIN_X + 11, y - 1.1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_400);
  const genLine = `Generado el ${formatDate(new Date())}`;
  if (coachName) {
    doc.text(genLine, pageWidth - PAGE_MARGIN_X, y - 3, { align: 'right' });
    doc.text(`Entrenador: ${coachName}`, pageWidth - PAGE_MARGIN_X, y + 1, { align: 'right' });
  } else {
    doc.text(genLine, pageWidth - PAGE_MARGIN_X, y - 1, { align: 'right' });
  }

  y += 7;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.7);
  doc.line(PAGE_MARGIN_X, y, pageWidth - PAGE_MARGIN_X, y);
  return y + 8;
}

function drawMetaRow(doc, y, cards) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - PAGE_MARGIN_X * 2;
  const gap = 4;
  const cardW = (usable - gap * (cards.length - 1)) / cards.length;
  const cardH = 13;

  cards.forEach((card, i) => {
    const x = PAGE_MARGIN_X + i * (cardW + gap);
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.3);
    doc.setTextColor(...GRAY_400);
    doc.text(card.label.toUpperCase(), x + 3, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...GRAY_900);
    const valueLines = doc.splitTextToSize(card.value, cardW - 6);
    doc.text(valueLines.slice(0, 2), x + 3, y + 9);
  });

  return y + cardH + 9;
}

// Devuelve las líneas ya envueltas para el nombre/subtítulo del ejercicio y
// para las notas, y con ellas la altura real que necesita la fila — así la
// tabla no depende del cálculo automático de jspdf-autotable (que no admite
// mezclar negrita/gris dentro de la misma celda).
function measureRow(doc, ex, info) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const iconSpace = info?.videoUrl ? 5 : 0;
  const nameLines = doc.splitTextToSize(ex.exerciseName || 'Ejercicio', COL_WIDTHS.exercise - 4 - iconSpace);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  const subText = [info?.categoryName, info?.subcategoryName].filter(Boolean).join(' · ');
  const subLines = subText ? doc.splitTextToSize(subText, COL_WIDTHS.exercise - 4) : [];

  const hasNotes = !!(ex.instructions && ex.instructions.trim());
  doc.setFontSize(8);
  const notesWidth = notesColWidth(doc) - 6;
  const notesLines = hasNotes
    ? doc.splitTextToSize(ex.instructions.trim(), notesWidth)
    : [];

  const exerciseHeight = 4 + nameLines.length * 3.6 + subLines.length * 3.1 + 2.5;
  const notesHeight = hasNotes
    ? 4 + notesLines.length * 3.4 + 2.5
    : 9;

  return {
    nameLines,
    subLines,
    notesLines,
    hasNotes,
    height: Math.max(exerciseHeight, notesHeight, 11)
  };
}

function notesColWidth(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - PAGE_MARGIN_X * 2;
  return usable - COL_WIDTHS.num - COL_WIDTHS.exercise - COL_WIDTHS.target - COL_WIDTHS.rest;
}

function drawBlock(doc, y, block, index, exercisesById) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usable = pageWidth - PAGE_MARGIN_X * 2;

  // Cabecera del bloque no cabe suelta al final de una página: si hay menos
  // de ~30mm libres antes del pie, se pasa a la siguiente.
  if (y > pageHeight - 40) {
    doc.addPage();
    y = 16;
  }

  doc.setFillColor(...ACCENT_LIGHT);
  doc.rect(PAGE_MARGIN_X, y, usable, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...ACCENT_DARK);
  doc.text(`Bloque ${index + 1} · ${block.name || 'Ejercicios'}`, PAGE_MARGIN_X + 3, y + 5.3);

  const rounds = Number(block.rounds) || 1;
  const roundsLabel = `${rounds} serie${rounds === 1 ? '' : 's'}`;
  doc.setFontSize(8);
  const roundsW = doc.getTextWidth(roundsLabel) + 6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageWidth - PAGE_MARGIN_X - roundsW - 2, y + 1.6, roundsW, 4.8, 2.4, 2.4, 'F');
  doc.setTextColor(...ACCENT);
  doc.text(roundsLabel, pageWidth - PAGE_MARGIN_X - roundsW / 2 - 2, y + 4.9, { align: 'center' });

  y += 8;

  const exercises = block.exercises || [];
  const rows = exercises.map((ex, i) => {
    const info = exercisesById.get(String(ex.exerciseId));
    return { ex, info, measure: measureRow(doc, ex, info), n: i + 1 };
  });

  // Cabecera de columnas de la tabla de ejercicios
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY_400);
  const headerH = 6;
  let hx = PAGE_MARGIN_X;
  const labels = [
    ['#', COL_WIDTHS.num, 'center'],
    ['EJERCICIO', COL_WIDTHS.exercise, 'left'],
    ['OBJETIVO', COL_WIDTHS.target, 'left'],
    ['DESCANSO', COL_WIDTHS.rest, 'left'],
    ['NOTAS DEL ENTRENADOR', notesColWidth(doc), 'left']
  ];
  labels.forEach(([label, w, align]) => {
    const tx = align === 'center' ? hx + w / 2 : hx + 2;
    doc.text(label, tx, y + 4, { align: align === 'center' ? 'center' : 'left' });
    hx += w;
  });
  doc.line(PAGE_MARGIN_X, y + headerH, pageWidth - PAGE_MARGIN_X, y + headerH);
  y += headerH + 2;

  rows.forEach(({ ex, info, measure, n }) => {
    if (y + measure.height > pageHeight - 22) {
      doc.addPage();
      y = 16;
    }

    let cx = PAGE_MARGIN_X;

    // #
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_400);
    doc.text(String(n), cx + COL_WIDTHS.num / 2, y + 5, { align: 'center' });
    cx += COL_WIDTHS.num;

    // Ejercicio: nombre en negrita + icono de vídeo + subtítulo categoría
    let ey = y + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY_900);
    measure.nameLines.forEach((line, i) => {
      doc.text(line, cx + 2, ey + i * 3.6);
    });
    if (info?.videoUrl) {
      const iconX = cx + 2 + doc.getTextWidth(measure.nameLines[0]) + 2;
      const iconY = ey - 1.6;
      doc.setFillColor(...ACCENT);
      doc.circle(iconX + 1.4, iconY, 1.6, 'F');
      doc.setFillColor(255, 255, 255);
      doc.triangle(iconX + 0.7, iconY - 0.9, iconX + 0.7, iconY + 0.9, iconX + 2.1, iconY, 'F');
      doc.link(iconX - 1, iconY - 1.6, 5.2, 3.2, { url: info.videoUrl });
    }
    ey += measure.nameLines.length * 3.6 + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...GRAY_400);
    measure.subLines.forEach((line, i) => {
      doc.text(line, cx + 2, ey + i * 3.1);
    });
    cx += COL_WIDTHS.exercise;

    // Objetivo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_900);
    doc.text(formatObjetivo(ex), cx + 2, y + 5.5);
    cx += COL_WIDTHS.target;

    // Descanso
    doc.setTextColor(...GRAY_500);
    doc.text(formatDescanso(ex), cx + 2, y + 5.5);
    cx += COL_WIDTHS.rest;

    // Notas del entrenador
    const nw = notesColWidth(doc);
    if (measure.hasNotes) {
      const boxH = measure.height - 3;
      doc.setFillColor(...NOTES_BG);
      doc.rect(cx + 2, y, nw - 4, boxH, 'F');
      doc.setFillColor(...NOTES_BORDER);
      doc.rect(cx + 2, y, 0.8, boxH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...NOTES_TEXT);
      measure.notesLines.forEach((line, i) => {
        doc.text(line, cx + 4.5, y + 4.2 + i * 3.4);
      });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_300);
      doc.text('Sin notas', cx + 2, y + 5.5);
    }

    y += measure.height;
    doc.setDrawColor(243, 244, 246);
    doc.setLineWidth(0.15);
    doc.line(PAGE_MARGIN_X, y, pageWidth - PAGE_MARGIN_X, y);
    y += 1.5;
  });

  return y + 6;
}

function drawFooters(doc) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN_X, pageHeight - 14, pageWidth - PAGE_MARGIN_X, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_400);
    doc.text(String(i), pageWidth / 2, pageHeight - 9.5, { align: 'center' });
  }
}

function slugify(name) {
  return (name || 'entrenamiento')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Construye el documento PDF en memoria (sin tocar red ni disco) a partir
 * del plannedSnapshot de una asignación ya resuelto con el catálogo de
 * ejercicios. Separado de downloadWorkoutAssignmentPdf para poder probar el
 * dibujado con datos de ejemplo sin necesidad de sesión ni Firestore.
 */
export function buildWorkoutPdfDoc(snap, { clientName, coachName, scheduledAt } = {}, exercisesById = new Map()) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let y = drawBrandHeader(doc, { coachName });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...GRAY_900);
  const titleLines = doc.splitTextToSize(snap.name || 'Entrenamiento', doc.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2);
  doc.text(titleLines, PAGE_MARGIN_X, y);
  y += titleLines.length * 6.5;

  if (snap.description && snap.description.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GRAY_500);
    const descLines = doc.splitTextToSize(snap.description.trim(), doc.internal.pageSize.getWidth() - PAGE_MARGIN_X * 2 - 40);
    doc.text(descLines, PAGE_MARGIN_X, y);
    y += descLines.length * 4.2 + 4;
  } else {
    y += 3;
  }

  const totalExercises = (snap.blocks || []).reduce((n, b) => n + (b.exercises?.length || 0), 0);
  y = drawMetaRow(doc, y, [
    { label: 'Deportista', value: clientName || '—' },
    { label: 'Fecha programada', value: scheduledAt ? formatDate(scheduledAt) : '—' },
    { label: 'Duración estimada', value: `${snap.estimatedDurationMinutes || 60} minutos` },
    { label: 'Bloques', value: `${(snap.blocks || []).length} bloques · ${totalExercises} ejercicios` }
  ]);

  (snap.blocks || []).forEach((block, i) => {
    y = drawBlock(doc, y, block, i, exercisesById);
  });

  drawFooters(doc);
  return doc;
}

/**
 * Genera y descarga el PDF de un entrenamiento asignado (el plan, sin
 * resultados) a partir de su plannedSnapshot.
 */
export async function downloadWorkoutAssignmentPdf(assignment, { clientName, coachName } = {}) {
  const snap = assignment?.plannedSnapshot;
  if (!snap) {
    throw new Error('Este entrenamiento todavía no tiene datos guardados para generar el PDF.');
  }

  // El snapshot solo guarda exerciseId + nombre; categoría, subcategoría y
  // vídeo se resuelven contra el catálogo actual (si el ejercicio se borró
  // o cambió de categoría después de asignarse, el PDF usa lo que haya hoy).
  const exercisesById = new Map();
  try {
    const [exs, cats, subs] = await Promise.all([
      storage.getExercises(),
      storage.getEntities(KEYS.EX_CATEGORIES),
      storage.getEntities(KEYS.EX_SUBCATEGORIES)
    ]);
    const catById = new Map(cats.map(c => [String(c.id), c.name]));
    const subById = new Map(subs.map(s => [String(s.id), s.name]));
    exs.forEach(e => exercisesById.set(String(e.id), {
      videoUrl: e.videoUrl || null,
      categoryName: catById.get(String(e.categoryId)) || null,
      subcategoryName: subById.get(String(e.subcategoryId)) || null
    }));
  } catch (err) {
    console.error('No se pudo cargar el catálogo de ejercicios para el PDF:', err);
  }

  const doc = buildWorkoutPdfDoc(snap, { clientName, coachName, scheduledAt: assignment.scheduledAt }, exercisesById);

  const fileName = `entrenamiento-${slugify(snap.name)}${assignment.scheduledAt ? '-' + assignment.scheduledAt : ''}.pdf`;
  doc.save(fileName);
}
