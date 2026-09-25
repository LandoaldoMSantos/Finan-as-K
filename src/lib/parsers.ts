/**
 * Parser for CSV and QIF files for financial data import.
 */

export interface ParsedSplit {
  categoryName: string;
  subcategoryName?: string;
  amount: number; // in cents
  memo?: string;
}

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  payee: string;
  amount: number; // in cents
  type: 'debito' | 'credito';
  memo: string;
  categoryName?: string;
  subcategoryName?: string;
  splits?: ParsedSplit[];
  isRecurring?: boolean;
  recurrenceInterval?: string | null;
  remainingOccurrences?: number | null;
  nextDueDate?: string | null;
}

/**
 * Strips Byte Order Mark (BOM) if present.
 */
export function cleanContent(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}

/**
 * Automatically detects whether content is QIF or CSV.
 */
export function detectFormat(content: string): 'qif' | 'csv' | 'unknown' {
  const clean = cleanContent(content).trim();
  const lowerClean = clean.toLowerCase();

  if (
    lowerClean.startsWith('!type:') || 
    lowerClean.includes('\n!type:') ||
    lowerClean.startsWith('!account') ||
    lowerClean.includes('\n!account')
  ) {
    return 'qif';
  }

  // If it has commas/semicolons and newlines, default to CSV
  if ((clean.includes(',') || clean.includes(';')) && clean.includes('\n')) {
    return 'csv';
  }
  return 'unknown';
}

/**
 * Automatically detects whether a CSV file uses a comma or a semicolon.
 */
export function detectCSVDelimiter(content: string): string {
  const lines = content.split('\n').slice(0, 5); // scan first 5 lines
  let commaCount = 0;
  let semicolonCount = 0;
  for (const line of lines) {
    commaCount += (line.match(/,/g) || []).length;
    semicolonCount += (line.match(/;/g) || []).length;
  }
  return semicolonCount > commaCount ? ';' : ',';
}

/**
 * Smart detection of date format in QIF files (DD/MM vs MM/DD).
 */
export function detectQIFDateFormat(content: string): 'DD/MM' | 'MM/DD' {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('D')) {
      const dateStr = trimmed.slice(1).trim();
      // Clean dateStr
      const clean = dateStr.replace(/['’]/g, '/').replace(/\s+/g, '');
      const datePart = clean.split(/\s+/)[0];
      const parts = datePart.split(/[/\-.]/);
      if (parts.length === 3) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first > 12 && second <= 12) {
          return 'DD/MM';
        }
        if (second > 12 && first <= 12) {
          return 'MM/DD';
        }
      }
    }
  }
  // Default to DD/MM for Portuguese-speaking context, as European/Brazilian is more common here
  return 'DD/MM';
}

/**
 * Tries to parse different date formats into YYYY-MM-DD.
 */
export function parseQIFDate(dateStr: string, dateFormat: 'DD/MM' | 'MM/DD' = 'DD/MM'): string {
  const datePart = dateStr.trim().split(/\s+/)[0];
  const clean = datePart.replace(/['’]/g, '/').replace(/\s+/g, '');
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  const parts = clean.split(/[/\-.]/);
  if (parts.length === 3) {
    const part1 = parseInt(parts[0], 10);
    const part2 = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }

    let day = 1;
    let month = 1;

    if (dateFormat === 'DD/MM') {
      day = part1;
      month = part2;
    } else {
      month = part1;
      day = part2;
    }

    // Smart self-correction if numbers are out of bound
    if (month > 12 && day <= 12) {
      const temp = month;
      month = day;
      day = temp;
    }

    // Handle Year-First (e.g. YYYY/MM/DD)
    const firstPart = parseInt(parts[0], 10);
    if (firstPart > 100) {
      year = firstPart;
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      month = Math.max(1, Math.min(12, month));
      day = Math.max(1, Math.min(31, day));
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Parses QIF amount into cents, supporting both dots and commas as decimal separators.
 */
export function parseQIFAmount(amountStr: string): number {
  let isNegative = false;
  let raw = amountStr.trim().toLowerCase();
  
  // Extract digits, punctuation, and sign/type indicators
  const cleanForSign = raw.replace(/[^\d.,\-+()dc]/g, '').trim();
  
  // Check for parentheses indicating negative
  if (cleanForSign.startsWith('(') && cleanForSign.endsWith(')')) {
    isNegative = true;
  }
  
  // Check for trailing or leading minus
  if (cleanForSign.startsWith('-') || cleanForSign.endsWith('-')) {
    isNegative = true;
  }
  
  // Check for trailing 'd' (debito / expense)
  if (cleanForSign.endsWith('d')) {
    isNegative = true;
  }

  let clean = cleanForSign.replace(/[^\d.,]/g, '').trim();
  if (!clean) return 0;

  if (clean.includes('.') && clean.includes(',')) {
    const dotIdx = clean.lastIndexOf('.');
    const commaIdx = clean.lastIndexOf(',');
    if (commaIdx > dotIdx) {
      // Comma is decimal, dot is thousands separator
      clean = clean.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // Dot is decimal, comma is thousands separator
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    // Only comma is present, treat as decimal separator
    clean = clean.replace(/,/g, '.');
  }

  let parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;
  
  if (isNegative) {
    parsed = -Math.abs(parsed);
  }
  
  return Math.round(parsed * 100);
}

interface QIFParsedTransaction {
  date?: string;
  payee?: string;
  amount?: number;
  type?: 'debito' | 'credito';
  memo?: string;
  categoryRaw?: string;
  categoryName?: string;
  subcategoryName?: string;
  splits?: { categoryRaw: string; memo?: string; amount?: number }[];
}

/**
 * Parses QIF format text.
 */
export function parseQIF(content: string): ParsedTransaction[] {
  const cleanText = cleanContent(content);
  const dateFormat = detectQIFDateFormat(cleanText);
  const lines = cleanText.split(/\r?\n/);
  const transactions: ParsedTransaction[] = [];
  let currentTx: QIFParsedTransaction = {};
  let inRecurringSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('!Type:') || trimmed.startsWith('!type:')) {
      const typeVal = trimmed.slice(6).toLowerCase().trim();
      if (
        typeVal.includes('recurring') || 
        typeVal.includes('schedule') || 
        typeVal.includes('scheduled') || 
        typeVal.includes('agenda') || 
        typeVal.includes('recorrente')
      ) {
        inRecurringSection = true;
      } else {
        inRecurringSection = false;
      }
      continue;
    }

    if (trimmed === '^') {
      // End of transaction
      if (currentTx.date && currentTx.amount !== undefined) {
        if (currentTx.categoryRaw) {
          const parts = currentTx.categoryRaw.split(':');
          currentTx.categoryName = parts[0].trim();
          if (parts.length > 1) {
            currentTx.subcategoryName = parts[1].trim();
          }
        }

        let processedSplits: ParsedSplit[] | undefined = undefined;
        if (currentTx.splits && currentTx.splits.length > 0) {
          processedSplits = currentTx.splits.map(s => {
            const parts = s.categoryRaw.split(':');
            const catName = parts[0].trim();
            const subName = parts.length > 1 ? parts[1].trim() : undefined;
            return {
              categoryName: catName,
              subcategoryName: subName,
              amount: Math.abs(s.amount || 0),
              memo: s.memo || '',
            };
          });
        }

        transactions.push({
          date: currentTx.date,
          payee: currentTx.payee || 'Beneficiário não especificado',
          amount: Math.abs(currentTx.amount),
          type: currentTx.amount < 0 ? 'debito' : 'credito',
          memo: currentTx.memo || '',
          categoryName: currentTx.categoryName,
          subcategoryName: currentTx.subcategoryName,
          splits: processedSplits,
          isRecurring: inRecurringSection,
          recurrenceInterval: inRecurringSection ? 'mensal' : undefined,
          nextDueDate: inRecurringSection ? currentTx.date : undefined,
        });
      }
      currentTx = {};
      continue;
    }

    const code = trimmed[0];
    const value = trimmed.slice(1).trim();

    switch (code) {
      case 'D': // Date
        currentTx.date = parseQIFDate(value, dateFormat);
        break;
      case 'T': // Amount
        currentTx.amount = parseQIFAmount(value);
        break;
      case 'P': // Payee
        currentTx.payee = value;
        break;
      case 'M': // Memo
        currentTx.memo = value;
        break;
      case 'L': // Category
        currentTx.categoryRaw = value;
        break;
      case 'S': // Split category
        if (!currentTx.splits) currentTx.splits = [];
        currentTx.splits.push({ categoryRaw: value });
        break;
      case 'E': // Split memo
        if (currentTx.splits && currentTx.splits.length > 0) {
          currentTx.splits[currentTx.splits.length - 1].memo = value;
        }
        break;
      case '$': // Split amount
        if (currentTx.splits && currentTx.splits.length > 0) {
          currentTx.splits[currentTx.splits.length - 1].amount = parseQIFAmount(value);
        }
        break;
    }
  }

  return transactions;
}

/**
 * Parses CSV lines considering quotes and commas/semicolons.
 */
export function parseCSV(content: string, delimiter?: string): string[][] {
  const clean = cleanContent(content);
  const activeDelimiter = delimiter || detectCSVDelimiter(clean);

  const rows: string[][] = [];
  let row: string[] = [];
  let insideQuote = false;
  let entry = '';

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        entry += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === activeDelimiter && !insideQuote) {
      row.push(entry.trim());
      entry = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(entry.trim());
      if (row.length > 0 && row.some(cell => cell !== '')) {
        rows.push(row);
      }
      row = [];
      entry = '';
    } else {
      entry += char;
    }
  }

  if (entry || row.length > 0) {
    row.push(entry.trim());
    if (row.length > 0 && row.some(cell => cell !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Maps CSV rows based on user or automatic column indexes.
 */
export function mapCSVTransactions(
  rows: string[][],
  mapping: {
    dateIdx: number;
    payeeIdx: number;
    amountIdx: number;
    typeIdx?: number;
    memoIdx?: number;
    categoryIdx?: number;
    isRecurringIdx?: number;
    recurrenceIntervalIdx?: number;
    remainingOccurrencesIdx?: number;
    nextDueDateIdx?: number;
    debitoCreditoValue?: 'auto' | string;
  },
  hasHeader = true
): ParsedTransaction[] {
  const startIndex = hasHeader ? 1 : 0;
  const transactions: ParsedTransaction[] = [];

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length <= Math.max(mapping.dateIdx, mapping.payeeIdx, mapping.amountIdx)) {
      continue;
    }

    const dateStr = row[mapping.dateIdx];
    const payeeStr = row[mapping.payeeIdx];
    const amountStr = row[mapping.amountIdx];
    const memoStr = mapping.memoIdx !== undefined && mapping.memoIdx !== -1 ? row[mapping.memoIdx] : '';
    const categoryStr = mapping.categoryIdx !== undefined && mapping.categoryIdx !== -1 ? row[mapping.categoryIdx] : '';
    const isRecurringStr = mapping.isRecurringIdx !== undefined && mapping.isRecurringIdx !== -1 ? row[mapping.isRecurringIdx] : '';
    const recurrenceIntervalStr = mapping.recurrenceIntervalIdx !== undefined && mapping.recurrenceIntervalIdx !== -1 ? row[mapping.recurrenceIntervalIdx] : '';
    const remainingOccurrencesStr = mapping.remainingOccurrencesIdx !== undefined && mapping.remainingOccurrencesIdx !== -1 ? row[mapping.remainingOccurrencesIdx] : '';
    const nextDueDateStr = mapping.nextDueDateIdx !== undefined && mapping.nextDueDateIdx !== -1 ? row[mapping.nextDueDateIdx] : '';

    if (!dateStr || !amountStr) continue;

    const date = parseQIFDate(dateStr);
    const amountCents = parseQIFAmount(amountStr);
    const absAmount = Math.abs(amountCents);

    let type: 'debito' | 'credito' = amountCents < 0 ? 'debito' : 'credito';

    // Heuristic: check if the amount column header itself indicates debito/credito
    const amountHeader = hasHeader && rows[0] && rows[0][mapping.amountIdx]
      ? rows[0][mapping.amountIdx].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      : '';
    
    if (amountHeader) {
      if (
        amountHeader.includes('debito') || 
        amountHeader.includes('saida') || 
        amountHeader.includes('despesa') || 
        amountHeader.includes('pago') || 
        amountHeader.includes('pagamento') || 
        amountHeader.includes('gasto') || 
        amountHeader.includes('expense') || 
        amountHeader.includes('outflow')
      ) {
        type = 'debito';
      } else if (
        amountHeader.includes('credito') || 
        amountHeader.includes('entrada') || 
        amountHeader.includes('receita') || 
        amountHeader.includes('recebimento') || 
        amountHeader.includes('deposito') || 
        amountHeader.includes('income') || 
        amountHeader.includes('inflow')
      ) {
        type = 'credito';
      }
    }

    if (mapping.typeIdx !== undefined && mapping.typeIdx !== -1 && row[mapping.typeIdx]) {
      const typeVal = row[mapping.typeIdx].toLowerCase().trim();
      if (
        typeVal === 'd' || 
        typeVal === 'deb' || 
        typeVal === 'saida' ||
        typeVal === 's' ||
        typeVal === '-' ||
        typeVal.includes('deb') || 
        typeVal.includes('saida') || 
        typeVal.includes('out') || 
        typeVal.includes('pago') ||
        typeVal.includes('despesa') ||
        typeVal.includes('gasto') ||
        typeVal.includes('pag')
      ) {
        type = 'debito';
      } else if (
        typeVal === 'c' || 
        typeVal === 'cred' || 
        typeVal === 'entrada' ||
        typeVal === 'e' ||
        typeVal === '+' ||
        typeVal.includes('cred') || 
        typeVal.includes('entr') || 
        typeVal.includes('in') || 
        typeVal.includes('receb') ||
        typeVal.includes('receita') ||
        typeVal.includes('ganh') ||
        typeVal.includes('dep')
      ) {
        type = 'credito';
      }
    }

    let categoryName: string | undefined;
    let subcategoryName: string | undefined;
    if (categoryStr) {
      const parts = categoryStr.split(/[>:→]/);
      categoryName = parts[0].trim();
      if (parts.length > 1) {
        subcategoryName = parts[1].trim();
      }
    }

    // Parse recurrence info
    let isRecurring = false;
    let recurrenceInterval: string | null = null;

    const getIntervalFromStr = (str: string): string | null => {
      const lower = str.toLowerCase().trim();
      if (lower.includes('diar') || lower.includes('day') || lower.includes('daily') || lower === 'd' || lower === 'dia') {
        return 'diario';
      } else if (lower.includes('sem') || lower.includes('week') || lower.includes('weekly') || lower === 's') {
        return 'semanal';
      } else if (lower.includes('quinz') || lower.includes('biweek') || lower.includes('fortnight') || lower === 'q') {
        return 'quinzenal';
      } else if (lower.includes('mes') || lower.includes('men') || lower.includes('month') || lower.includes('monthly') || lower === 'm') {
        return 'mensal';
      } else if (lower.includes('an') || lower.includes('year') || lower.includes('annual') || lower.includes('yearly') || lower === 'a') {
        return 'anual';
      }
      return null;
    };

    if (isRecurringStr) {
      const lowerRec = isRecurringStr.toLowerCase().trim();
      const detectedInterval = getIntervalFromStr(isRecurringStr);
      
      if (
        lowerRec === 'true' || 
        lowerRec === '1' || 
        lowerRec === 'sim' || 
        lowerRec === 'yes' || 
        lowerRec === 's' || 
        lowerRec === 'recorrente' || 
        lowerRec === 'agendado' || 
        lowerRec === 'agendada' || 
        lowerRec === 'agenda' || 
        lowerRec === 'agendamento' ||
        detectedInterval !== null
      ) {
        isRecurring = true;
        if (detectedInterval) {
          recurrenceInterval = detectedInterval;
        }
      }
    }

    if (recurrenceIntervalStr) {
      const detectedInterval = getIntervalFromStr(recurrenceIntervalStr);
      if (detectedInterval) {
        isRecurring = true;
        recurrenceInterval = detectedInterval;
      }
    }

    if (isRecurring && !recurrenceInterval) {
      recurrenceInterval = 'mensal'; // default fallback
    }

    let remainingOccurrences: number | null = null;
    if (remainingOccurrencesStr) {
      const parsed = parseInt(remainingOccurrencesStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        remainingOccurrences = parsed;
      }
    }

    let nextDueDate: string | null = null;
    if (nextDueDateStr) {
      nextDueDate = parseQIFDate(nextDueDateStr);
    } else if (isRecurring) {
      nextDueDate = date; // fallback to transaction date
    }

    transactions.push({
      date,
      payee: payeeStr || 'Beneficiário não especificado',
      amount: absAmount,
      type,
      memo: memoStr || '',
      categoryName,
      subcategoryName,
      isRecurring,
      recurrenceInterval,
      remainingOccurrences,
      nextDueDate,
    });
  }

  return transactions;
}

/**
 * Automatically attempts to find matching column indexes for financial headers.
 */
export function autoDetectMapping(headers: string[]): {
  dateIdx: number;
  payeeIdx: number;
  amountIdx: number;
  typeIdx: number;
  memoIdx: number;
  categoryIdx: number;
  isRecurringIdx: number;
  recurrenceIntervalIdx: number;
  remainingOccurrencesIdx: number;
  nextDueDateIdx: number;
} {
  let dateIdx = -1;
  let payeeIdx = -1;
  let amountIdx = -1;
  let typeIdx = -1;
  let memoIdx = -1;
  let categoryIdx = -1;
  let isRecurringIdx = -1;
  let recurrenceIntervalIdx = -1;
  let remainingOccurrencesIdx = -1;
  let nextDueDateIdx = -1;

  headers.forEach((header, idx) => {
    const h = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    if (h.includes('data') || h.includes('date') || h.includes('dia')) {
      if (dateIdx === -1) dateIdx = idx;
    }
    else if (h.includes('beneficiario') || h.includes('payee') || h.includes('descri') || h.includes('estabelecimento') || h.includes('historico') || h.includes('detalhe')) {
      if (payeeIdx === -1) payeeIdx = idx;
    }
    else if (h.includes('valor') || h.includes('amount') || h.includes('saldo') || h.includes('quantia')) {
      if (amountIdx === -1) amountIdx = idx;
    }
    else if (h.includes('tipo') || h.includes('type') || h.includes('debito/credito') || h === 'd/c' || h === 'c/d' || h.includes('natureza') || h.includes('sinal') || h.includes('operacao')) {
      if (typeIdx === -1) typeIdx = idx;
    }
    else if (h.includes('memo') || h.includes('observa') || h.includes('comentario') || h.includes('nota') || h.includes('info')) {
      if (memoIdx === -1) memoIdx = idx;
    }
    else if (h.includes('categoria') || h.includes('category') || h.includes('grupo') || h.includes('subcategoria')) {
      if (categoryIdx === -1) categoryIdx = idx;
    }
    else if (h.includes('recorrente') || h.includes('recorrencia') || h.includes('recurring') || h.includes('repetir') || h.includes('is_recurring') || h.includes('agendado') || h.includes('agendada') || h.includes('agendamento') || h.includes('agenda')) {
      if (isRecurringIdx === -1) isRecurringIdx = idx;
    }
    else if (h.includes('intervalo') || h.includes('frequency') || h.includes('frequencia') || h.includes('periodo') || h.includes('recurrence_interval')) {
      if (recurrenceIntervalIdx === -1) recurrenceIntervalIdx = idx;
    }
    else if (h.includes('ocorrencia') || h.includes('parcelas') || h.includes('remaining') || h.includes('num_parcelas') || h.includes('remaining_occurrences')) {
      if (remainingOccurrencesIdx === -1) remainingOccurrencesIdx = idx;
    }
    else if (h.includes('proximo_vencimento') || h.includes('proximo vencimento') || h.includes('next_due_date') || h.includes('vencimento') || h.includes('next_due')) {
      if (nextDueDateIdx === -1) nextDueDateIdx = idx;
    }
  });

  if (dateIdx === -1) dateIdx = 0;
  if (payeeIdx === -1) payeeIdx = Math.min(1, headers.length - 1);
  if (amountIdx === -1) amountIdx = Math.min(2, headers.length - 1);

  return { 
    dateIdx, 
    payeeIdx, 
    amountIdx, 
    typeIdx, 
    memoIdx, 
    categoryIdx, 
    isRecurringIdx, 
    recurrenceIntervalIdx, 
    remainingOccurrencesIdx, 
    nextDueDateIdx 
  };
}

