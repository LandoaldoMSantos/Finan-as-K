import React, { useState, useMemo } from 'react';
import { Category, Transaction } from '../types.ts';
import { formatCurrency, formatDate } from '../lib/utils.ts';
import { 
  FileSpreadsheet, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  Printer, 
  Download, 
  CheckSquare, 
  Square,
  Filter,
  RefreshCw,
  FolderTree,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Scale,
  Search,
  CheckCircle2,
  Folder,
  Tag as TagIcon,
  HelpCircle,
  ArrowRightLeft
} from 'lucide-react';
import { EmptyState } from './common/EmptyState.tsx';

interface FinanceReportProps {
  categories: Category[];
  transactions: Transaction[];
  onRefresh: () => Promise<void>;
  onNavigate?: (view: string) => void;
}

export const FinanceReport: React.FC<FinanceReportProps> = ({
  categories,
  transactions,
  onRefresh,
  onNavigate
}) => {
  // 1. Local states for filters
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Default range: January 1st of current year to December 31st of current year
  const [startDateStr, setStartDateStr] = useState<string>(`${currentYear}-01-01`);
  const [endDateStr, setEndDateStr] = useState<string>(
    `${currentYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );
  
  const [periodicity, setPeriodicity] = useState<'semanal' | 'mensal' | 'anual'>('mensal');
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState<boolean>(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showOnlyWithMovement, setShowOnlyWithMovement] = useState<boolean>(false);

  // 2. Initialize selected categories (all selected by default)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(() => {
    return new Set<number>(categories.map(c => c.id));
  });
  const [includeUncategorized, setIncludeUncategorized] = useState<boolean>(true);

  // Helper to format Date to YYYY-MM-DD
  const formatDateToString = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Preset Date Ranges
  const applyPreset = (preset: 'este-mes' | 'ultimos-3-meses' | 'ano-atual' | 'ano-anterior') => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (preset === 'este-mes') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      setStartDateStr(formatDateToString(start));
      setEndDateStr(formatDateToString(end));
      setPeriodicity('semanal');
    } else if (preset === 'ultimos-3-meses') {
      const start = new Date(year, month - 2, 1);
      const end = new Date(year, month + 1, 0);
      setStartDateStr(formatDateToString(start));
      setEndDateStr(formatDateToString(end));
      setPeriodicity('mensal');
    } else if (preset === 'ano-atual') {
      setStartDateStr(`${year}-01-01`);
      setEndDateStr(`${year}-12-31`);
      setPeriodicity('mensal');
    } else if (preset === 'ano-anterior') {
      setStartDateStr(`${year - 1}-01-01`);
      setEndDateStr(`${year - 1}-12-31`);
      setPeriodicity('mensal');
    }
  };

  // 3. Category grouping structures - sorted alphabetically
  const parentCategories = useMemo(() => {
    return categories
      .filter(c => c.parentId === null)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [categories]);

  const subcategoriesMap = useMemo(() => {
    const map = new Map<number, Category[]>();
    categories.forEach(c => {
      if (c.parentId !== null) {
        const list = map.get(c.parentId) || [];
        list.push(c);
        map.set(c.parentId, list);
      }
    });
    map.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    });
    return map;
  }, [categories]);

  const getSubcategories = (parentId: number) => {
    return subcategoriesMap.get(parentId) || [];
  };

  // 4. Category Checklist Handlers
  const handleToggleCategory = (catId: number, isParent: boolean) => {
    const newSelected = new Set(selectedCategoryIds);
    if (isParent) {
      const subs = getSubcategories(catId);
      const allSubsSelected = subs.every(sub => newSelected.has(sub.id));
      const parentSelected = newSelected.has(catId);

      if (parentSelected && allSubsSelected) {
        // Deselect parent and all subs
        newSelected.delete(catId);
        subs.forEach(sub => newSelected.delete(sub.id));
      } else {
        // Select parent and all subs
        newSelected.add(catId);
        subs.forEach(sub => newSelected.add(sub.id));
      }
    } else {
      // Toggle individual subcategory
      if (newSelected.has(catId)) {
        newSelected.delete(catId);
      } else {
        newSelected.add(catId);
      }
    }
    setSelectedCategoryIds(newSelected);
  };

  const handleSelectAllCategories = () => {
    setSelectedCategoryIds(new Set<number>(categories.map(c => c.id)));
    setIncludeUncategorized(true);
  };

  const handleDeselectAllCategories = () => {
    setSelectedCategoryIds(new Set<number>());
    setIncludeUncategorized(false);
  };

  const handleToggleGroup = (type: 'receita' | 'despesa', checked: boolean) => {
    const newSelected = new Set(selectedCategoryIds);
    categories.forEach(c => {
      if (c.type === type) {
        if (checked) {
          newSelected.add(c.id);
        } else {
          newSelected.delete(c.id);
        }
      }
    });
    setSelectedCategoryIds(newSelected);
  };

  // Filter categories by search query inside the filter modal
  const filteredRootReceitaCats = useMemo(() => {
    const rootReceitas = parentCategories.filter(p => p.type === 'receita');
    if (!categorySearchQuery.trim()) return rootReceitas;
    const q = categorySearchQuery.toLowerCase();
    return rootReceitas.filter(p => {
      const matchesParent = p.name.toLowerCase().includes(q);
      const matchesSub = getSubcategories(p.id).some(s => s.name.toLowerCase().includes(q));
      return matchesParent || matchesSub;
    });
  }, [parentCategories, categorySearchQuery]);

  const filteredRootDespesaCats = useMemo(() => {
    const rootDespesas = parentCategories.filter(p => p.type === 'despesa');
    if (!categorySearchQuery.trim()) return rootDespesas;
    const q = categorySearchQuery.toLowerCase();
    return rootDespesas.filter(p => {
      const matchesParent = p.name.toLowerCase().includes(q);
      const matchesSub = getSubcategories(p.id).some(s => s.name.toLowerCase().includes(q));
      return matchesParent || matchesSub;
    });
  }, [parentCategories, categorySearchQuery]);

  // 5. Generate Date Buckets dynamically
  const buckets = useMemo(() => {
    const start = new Date(startDateStr + 'T12:00:00');
    const end = new Date(endDateStr + 'T12:00:00');
    
    // Safety check to prevent freeze
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return [];
    }

    const list: { id: string; label: string; startDate: string; endDate: string }[] = [];

    if (periodicity === 'anual') {
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      for (let y = startYear; y <= endYear; y++) {
        const bStart = formatDateToString(new Date(Math.max(new Date(y, 0, 1).getTime(), start.getTime())));
        const bEnd = formatDateToString(new Date(Math.min(new Date(y, 11, 31).getTime(), end.getTime())));
        list.push({
          id: `${y}`,
          label: `${y}`,
          startDate: bStart,
          endDate: bEnd
        });
      }
    } else if (periodicity === 'mensal') {
      let curr = new Date(start.getFullYear(), start.getMonth(), 1);
      while (curr <= end) {
        const y = curr.getFullYear();
        const m = curr.getMonth();
        
        const bStart = formatDateToString(new Date(Math.max(new Date(y, m, 1).getTime(), start.getTime())));
        const lastDayOfMonth = new Date(y, m + 1, 0);
        const bEnd = formatDateToString(new Date(Math.min(lastDayOfMonth.getTime(), end.getTime())));

        const monthAbbrs = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const label = monthAbbrs[m] + (start.getFullYear() !== end.getFullYear() ? `/${String(y).slice(-2)}` : '');

        list.push({
          id: `${y}-${String(m + 1).padStart(2, '0')}`,
          label,
          startDate: bStart,
          endDate: bEnd
        });

        curr.setMonth(curr.getMonth() + 1);
      }
    } else if (periodicity === 'semanal') {
      let curr = new Date(start);
      let weekIndex = 1;
      while (curr <= end) {
        const bStart = new Date(curr);
        const bEnd = new Date(curr);
        bEnd.setDate(bEnd.getDate() + 6);
        if (bEnd > end) {
          bEnd.setTime(end.getTime());
        }

        const label = `${bStart.getDate()}/${bStart.getMonth() + 1} a ${bEnd.getDate()}/${bEnd.getMonth() + 1}`;
        list.push({
          id: `W-${weekIndex}`,
          label,
          startDate: formatDateToString(bStart),
          endDate: formatDateToString(bEnd)
        });

        curr.setDate(curr.getDate() + 7);
        weekIndex++;
      }
    }

    return list;
  }, [startDateStr, endDateStr, periodicity]);

  // 6. Compute transaction amounts mapped by category and bucket
  const reportData = useMemo(() => {
    // Setup empty maps
    const categoryAmounts: { [categoryId: number]: { [bucketId: string]: number } } = {};
    const parentCategoryAmounts: { [parentId: number]: { [bucketId: string]: number } } = {};
    const uncategorizedAmounts: { [type in 'receita' | 'despesa']: { [bucketId: string]: number } } = {
      receita: {},
      despesa: {}
    };

    const totalReceita: { [bucketId: string]: number } = {};
    const totalDespesa: { [bucketId: string]: number } = {};

    // Initialize buckets
    buckets.forEach(b => {
      totalReceita[b.id] = 0;
      totalDespesa[b.id] = 0;
      uncategorizedAmounts.receita[b.id] = 0;
      uncategorizedAmounts.despesa[b.id] = 0;
    });

    categories.forEach(c => {
      categoryAmounts[c.id] = {};
      buckets.forEach(b => {
        categoryAmounts[c.id][b.id] = 0;
      });
    });

    parentCategories.forEach(p => {
      parentCategoryAmounts[p.id] = {};
      buckets.forEach(b => {
        parentCategoryAmounts[p.id][b.id] = 0;
      });
    });

    // Process transactions
    transactions.forEach(t => {
      // Skip recurring template transactions and auto-generated scheduled entries
      if (t.isRecurring || (t.memo && t.memo.includes('[Agendado]'))) return;

      // 1. Date range match
      if (t.date < startDateStr || t.date > endDateStr) return;

      // 2. Identify the active bucket
      const matchedBucket = buckets.find(b => t.date >= b.startDate && t.date <= b.endDate);
      if (!matchedBucket) return;

      const bid = matchedBucket.id;
      const isIncome = t.type === 'credito'; // credits represent incomes, debits represent expenses

      if (t.splits && t.splits.length > 0) {
        // Process each split as its own amount and category
        t.splits.forEach(split => {
          const splitAmt = split.amount;
          if (split.categoryId === null) {
            if (includeUncategorized) {
              if (isIncome) {
                uncategorizedAmounts.receita[bid] = (uncategorizedAmounts.receita[bid] || 0) + splitAmt;
                totalReceita[bid] += splitAmt;
              } else {
                uncategorizedAmounts.despesa[bid] = (uncategorizedAmounts.despesa[bid] || 0) + splitAmt;
                totalDespesa[bid] += splitAmt;
              }
            }
          } else {
            if (selectedCategoryIds.has(split.categoryId)) {
              const cat = categories.find(c => c.id === split.categoryId);
              if (cat) {
                // Add to individual category cell
                categoryAmounts[cat.id][bid] = (categoryAmounts[cat.id][bid] || 0) + splitAmt;

                // Add to parent category total
                if (cat.parentId !== null) {
                  parentCategoryAmounts[cat.parentId][bid] = (parentCategoryAmounts[cat.parentId][bid] || 0) + splitAmt;
                } else {
                  parentCategoryAmounts[cat.id][bid] = (parentCategoryAmounts[cat.id][bid] || 0) + splitAmt;
                }

                // Add to high-level sectional totals
                if (cat.type === 'receita') {
                  totalReceita[bid] += splitAmt;
                } else if (cat.type === 'despesa') {
                  totalDespesa[bid] += splitAmt;
                }
              }
            }
          }
        });
      } else {
        // Normal single-category transaction
        const amt = t.amount; // in cents

        // 3. Category logic
        if (t.categoryId === null) {
          if (includeUncategorized) {
            if (isIncome) {
              uncategorizedAmounts.receita[bid] = (uncategorizedAmounts.receita[bid] || 0) + amt;
              totalReceita[bid] += amt;
            } else {
              uncategorizedAmounts.despesa[bid] = (uncategorizedAmounts.despesa[bid] || 0) + amt;
              totalDespesa[bid] += amt;
            }
          }
        } else {
          // If category is selected
          if (selectedCategoryIds.has(t.categoryId)) {
            const cat = categories.find(c => c.id === t.categoryId);
            if (cat) {
              // Add to individual category cell
              categoryAmounts[cat.id][bid] = (categoryAmounts[cat.id][bid] || 0) + amt;

              // Add to parent category total
              if (cat.parentId !== null) {
                parentCategoryAmounts[cat.parentId][bid] = (parentCategoryAmounts[cat.parentId][bid] || 0) + amt;
              } else {
                parentCategoryAmounts[cat.id][bid] = (parentCategoryAmounts[cat.id][bid] || 0) + amt;
              }

              // Add to high-level sectional totals
              if (cat.type === 'receita') {
                totalReceita[bid] += amt;
              } else if (cat.type === 'despesa') {
                totalDespesa[bid] += amt;
              }
            }
          }
        }
      }
    });

    return {
      categoryAmounts,
      parentCategoryAmounts,
      uncategorizedAmounts,
      totalReceita,
      totalDespesa
    };
  }, [transactions, categories, parentCategories, buckets, selectedCategoryIds, includeUncategorized, startDateStr, endDateStr]);

  // 7. Dynamic stats helper
  const overallTotals = useMemo(() => {
    let totalIncomesSum = 0;
    let totalExpensesSum = 0;

    buckets.forEach(b => {
      totalIncomesSum += reportData.totalReceita[b.id] || 0;
      totalExpensesSum += reportData.totalDespesa[b.id] || 0;
    });

    const netResultSum = totalIncomesSum - totalExpensesSum;

    return {
      totalIncomesSum,
      totalExpensesSum,
      netResultSum
    };
  }, [buckets, reportData]);

  // Helpers to calculate sums across buckets for filtering
  const getCategorySumAcrossBuckets = (catId: number) => {
    let sum = 0;
    buckets.forEach(b => {
      sum += reportData.categoryAmounts[catId]?.[b.id] ?? 0;
    });
    return sum;
  };

  const getParentGroupSumAcrossBuckets = (parentId: number) => {
    let sum = 0;
    buckets.forEach(b => {
      sum += reportData.parentCategoryAmounts[parentId]?.[b.id] ?? 0;
    });
    return sum;
  };

  const getUncatIncomeSum = () => {
    let sum = 0;
    buckets.forEach(b => {
      sum += reportData.uncategorizedAmounts.receita[b.id] ?? 0;
    });
    return sum;
  };

  const getUncatExpenseSum = () => {
    let sum = 0;
    buckets.forEach(b => {
      sum += reportData.uncategorizedAmounts.despesa[b.id] ?? 0;
    });
    return sum;
  };

  // 8. CSV Exporter
  const handleExportCSV = () => {
    const headers = ['Categoria', ...buckets.map(b => b.label), 'Total'];
    const rows: string[][] = [];

    // Title Block
    rows.push(['Relatório de Receitas e Despesas - Finanças K']);
    rows.push([`Período: ${formatDate(startDateStr)} até ${formatDate(endDateStr)}`]);
    rows.push(['']);

    // RECEITAS SECTION
    rows.push(['RECEITAS']);
    parentCategories.filter(p => p.type === 'receita').forEach(p => {
      const subs = getSubcategories(p.id);
      const hasSubs = subs.length > 0;

      const isParentSelected = selectedCategoryIds.has(p.id);
      let activeSubs = subs.filter(sub => selectedCategoryIds.has(sub.id));

      if (showOnlyWithMovement) {
        activeSubs = activeSubs.filter(sub => getCategorySumAcrossBuckets(sub.id) !== 0);
      }

      if (!isParentSelected && activeSubs.length === 0) return;

      if (showOnlyWithMovement) {
        if (hasSubs) {
          if (getParentGroupSumAcrossBuckets(p.id) === 0) return;
        } else {
          if (getCategorySumAcrossBuckets(p.id) === 0) return;
        }
      }

      // Parent row
      let pTotal = 0;
      const pRowValues = buckets.map(b => {
        const val = reportData.categoryAmounts[p.id]?.[b.id] ?? 0;
        pTotal += val;
        return (val / 100).toFixed(2);
      });
      rows.push([p.name, ...pRowValues, (pTotal / 100).toFixed(2)]);

      // Sub rows
      if (hasSubs) {
        activeSubs.forEach(sub => {
          let subTotal = 0;
          const subRowValues = buckets.map(b => {
            const val = reportData.categoryAmounts[sub.id]?.[b.id] ?? 0;
            subTotal += val;
            return (val / 100).toFixed(2);
          });
          rows.push([`  ${sub.name}`, ...subRowValues, (subTotal / 100).toFixed(2)]);
        });

        // Group Total row
        let grpTotal = 0;
        const grpValues = buckets.map(b => {
          const val = reportData.parentCategoryAmounts[p.id]?.[b.id] ?? 0;
          grpTotal += val;
          return (val / 100).toFixed(2);
        });
        rows.push([`Total ${p.name}`, ...grpValues, (grpTotal / 100).toFixed(2)]);
      }
    });

    // Uncategorized Receipts
    if (includeUncategorized) {
      const uncatIncomeSum = getUncatIncomeSum();
      if (!showOnlyWithMovement || uncatIncomeSum !== 0) {
        let uncatTotal = 0;
        const uncatVals = buckets.map(b => {
          const val = reportData.uncategorizedAmounts.receita[b.id] ?? 0;
          uncatTotal += val;
          return (val / 100).toFixed(2);
        });
        rows.push(['Sem Categoria', ...uncatVals, (uncatTotal / 100).toFixed(2)]);
      }
    }

    // Total Receita row
    let totIncomeSum = 0;
    const totIncomeVals = buckets.map(b => {
      const val = reportData.totalReceita[b.id] ?? 0;
      totIncomeSum += val;
      return (val / 100).toFixed(2);
    });
    rows.push(['TOTAL RECEITAS', ...totIncomeVals, (totIncomeSum / 100).toFixed(2)]);
    rows.push(['']);

    // DESPESAS SECTION
    rows.push(['DESPESAS']);
    parentCategories.filter(p => p.type === 'despesa').forEach(p => {
      const subs = getSubcategories(p.id);
      const hasSubs = subs.length > 0;

      const isParentSelected = selectedCategoryIds.has(p.id);
      let activeSubs = subs.filter(sub => selectedCategoryIds.has(sub.id));

      if (showOnlyWithMovement) {
        activeSubs = activeSubs.filter(sub => getCategorySumAcrossBuckets(sub.id) !== 0);
      }

      if (!isParentSelected && activeSubs.length === 0) return;

      if (showOnlyWithMovement) {
        if (hasSubs) {
          if (getParentGroupSumAcrossBuckets(p.id) === 0) return;
        } else {
          if (getCategorySumAcrossBuckets(p.id) === 0) return;
        }
      }

      // Parent row
      let pTotal = 0;
      const pRowValues = buckets.map(b => {
        const val = reportData.categoryAmounts[p.id]?.[b.id] ?? 0;
        pTotal += val;
        return (val / 100).toFixed(2);
      });
      rows.push([p.name, ...pRowValues, (pTotal / 100).toFixed(2)]);

      // Sub rows
      if (hasSubs) {
        activeSubs.forEach(sub => {
          let subTotal = 0;
          const subRowValues = buckets.map(b => {
            const val = reportData.categoryAmounts[sub.id]?.[b.id] ?? 0;
            subTotal += val;
            return (val / 100).toFixed(2);
          });
          rows.push([`  ${sub.name}`, ...subRowValues, (subTotal / 100).toFixed(2)]);
        });

        // Group Total row
        let grpTotal = 0;
        const grpValues = buckets.map(b => {
          const val = reportData.parentCategoryAmounts[p.id]?.[b.id] ?? 0;
          grpTotal += val;
          return (val / 100).toFixed(2);
        });
        rows.push([`Total ${p.name}`, ...grpValues, (grpTotal / 100).toFixed(2)]);
      }
    });

    // Uncategorized Expenses
    if (includeUncategorized) {
      const uncatExpenseSum = getUncatExpenseSum();
      if (!showOnlyWithMovement || uncatExpenseSum !== 0) {
        let uncatTotal = 0;
        const uncatVals = buckets.map(b => {
          const val = reportData.uncategorizedAmounts.despesa[b.id] ?? 0;
          uncatTotal += val;
          return (val / 100).toFixed(2);
        });
        rows.push(['Sem Categoria', ...uncatVals, (uncatTotal / 100).toFixed(2)]);
      }
    }

    // Total Despesa row
    let totExpenseSum = 0;
    const totExpenseVals = buckets.map(b => {
      const val = reportData.totalDespesa[b.id] ?? 0;
      totExpenseSum += val;
      return (val / 100).toFixed(2);
    });
    rows.push(['TOTAL DESPESAS', ...totExpenseVals, (totExpenseSum / 100).toFixed(2)]);
    rows.push(['']);

    // NET RESULT
    let netResultSum = 0;
    const netResultVals = buckets.map(b => {
      const val = (reportData.totalReceita[b.id] ?? 0) - (reportData.totalDespesa[b.id] ?? 0);
      netResultSum += val;
      return (val / 100).toFixed(2);
    });
    rows.push(['TOTAL COMPLETO (RESULTADO LÍQUIDO)', ...netResultVals, (netResultSum / 100).toFixed(2)]);

    // Generate CSV string
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_caixa_${startDateStr}_a_${endDateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // 9. Cell rendering utility with pt-BR format (highlights negative values in red and zero cleanly)
  const renderCellAmount = (cents: number, useBold: boolean = false) => {
    if (cents === 0) {
      return <span className="text-gray-300 dark:text-gray-600 font-mono text-xs select-none">—</span>;
    }
    const formatted = Math.abs(cents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const isNegative = cents < 0;

    return (
      <span className={`font-mono text-xs ${
        isNegative 
          ? 'text-rose-600 dark:text-rose-400 font-bold' 
          : useBold ? 'text-gray-900 dark:text-white font-bold' : 'text-gray-700 dark:text-gray-300'
      }`}>
        {isNegative ? '-' : ''}{formatted}
      </span>
    );
  };

  const rootReceitaCats = parentCategories.filter(p => p.type === 'receita');
  const rootDespesaCats = parentCategories.filter(p => p.type === 'despesa');

  return (
    <div className="space-y-6 pb-12 animate-fade-in print:p-0 print:space-y-4">
      {/* 1. Page Header Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <FileSpreadsheet className="w-7 h-7 text-emerald-600 dark:text-emerald-500 shrink-0" />
            Relatório de Caixa
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Matriz temporal comparativa de receitas e despesas acumuladas por categoria
          </p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-all disabled:opacity-50 cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
            title="Atualizar dados do relatório"
            aria-label={isRefreshing ? "Atualizando dados..." : "Atualizar dados"}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} aria-hidden="true" />
          </button>
          
          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 text-xs font-bold text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all cursor-pointer shadow-sm shadow-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* 2. Filters & Presets Panel */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4 print:hidden">
        {/* Preset quick buttons */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            Atalhos:
          </span>
          <button
            type="button"
            onClick={() => applyPreset('este-mes')}
            className="px-3 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-200 transition-all cursor-pointer"
          >
            Este Mês
          </button>
          <button
            type="button"
            onClick={() => applyPreset('ultimos-3-meses')}
            className="px-3 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-200 transition-all cursor-pointer"
          >
            Últimos 3 Meses
          </button>
          <button
            type="button"
            onClick={() => applyPreset('ano-atual')}
            className="px-3 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-200 transition-all cursor-pointer"
          >
            Ano Atual ({currentYear})
          </button>
          <button
            type="button"
            onClick={() => applyPreset('ano-anterior')}
            className="px-3 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-200 transition-all cursor-pointer"
          >
            Ano Anterior ({currentYear - 1})
          </button>
        </div>

        {/* Detailed Filters row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Start Date */}
            <div className="flex flex-col gap-1">
              <label htmlFor="report-start-date" className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Início do Período
              </label>
              <input
                id="report-start-date"
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
              />
            </div>

            {/* End Date */}
            <div className="flex flex-col gap-1">
              <label htmlFor="report-end-date" className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Fim do Período
              </label>
              <input
                id="report-end-date"
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
              />
            </div>

            {/* Periodicity accumulation selection */}
            <div className="flex flex-col gap-1">
              <span id="report-periodicity-label" className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acúmulo por
              </span>
              <div 
                className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex gap-1 border border-gray-200/60 dark:border-gray-700/60"
                role="group"
                aria-labelledby="report-periodicity-label"
              >
                {(['semanal', 'mensal', 'anual'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={periodicity === mode}
                    onClick={() => setPeriodicity(mode)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all capitalize cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      periodicity === mode
                        ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    {mode === 'semanal' ? 'Semanal' : mode === 'mensal' ? 'Mensal' : 'Anual'}
                  </button>
                ))}
              </div>
            </div>

            {/* Show only with movement option */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filtro de Atividade</span>
              <label 
                htmlFor="report-movement-only"
                className="flex items-center gap-2 cursor-pointer select-none bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750 transition-all"
              >
                <input
                  id="report-movement-only"
                  type="checkbox"
                  checked={showOnlyWithMovement}
                  onChange={(e) => setShowOnlyWithMovement(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer accent-emerald-600"
                />
                <span className="font-semibold text-xs">Ocultar linhas zeradas</span>
              </label>
            </div>
          </div>

          {/* Filter Categories Trigger Button */}
          <button
            type="button"
            onClick={() => setIsCategoryFilterOpen(!isCategoryFilterOpen)}
            aria-expanded={isCategoryFilterOpen}
            aria-controls="report-category-filter-drawer"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-xs ${
              isCategoryFilterOpen || selectedCategoryIds.size < categories.length
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400'
                : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750'
            }`}
          >
            <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Categorias ({selectedCategoryIds.size}/{categories.length})</span>
            {isCategoryFilterOpen ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>

        {/* Collapsible checklist selector for categories and subcategories */}
        {isCategoryFilterOpen && (
          <div id="report-category-filter-drawer" className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-4 animate-fade-in">
            {/* Search bar & quick action buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-gray-50 dark:bg-gray-850 p-3 rounded-2xl border border-gray-150 dark:border-gray-800">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Pesquisar categoria no relatório..."
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleSelectAllCategories}
                  className="px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg cursor-pointer transition-colors"
                >
                  Selecionar Tudo
                </button>
                <span className="text-gray-300 dark:text-gray-700">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAllCategories}
                  className="px-2.5 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
                >
                  Desmarcar Tudo
                </button>
              </div>
            </div>

            {/* Dual Column grid for Receitas vs Despesas checklist */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[340px] overflow-y-auto pr-1">
              {/* Receipts group column */}
              <div className="space-y-3 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-150 dark:border-gray-800">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <h3 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    Categorias de Receitas
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleGroup('receita', true)}
                      className="text-[11px] text-gray-500 hover:text-emerald-600 font-semibold"
                    >
                      Todas
                    </button>
                    <span className="text-gray-300 dark:text-gray-700">|</span>
                    <button
                      type="button"
                      onClick={() => handleToggleGroup('receita', false)}
                      className="text-[11px] text-gray-500 hover:text-rose-500 font-semibold"
                    >
                      Nenhuma
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {filteredRootReceitaCats.map(parent => {
                    const subs = getSubcategories(parent.id);
                    const isParentSelected = selectedCategoryIds.has(parent.id);
                    const hasSubs = subs.length > 0;
                    const allSubsSelected = hasSubs && subs.every(s => selectedCategoryIds.has(s.id));
                    const isChecked = isParentSelected && (!hasSubs || allSubsSelected);

                    return (
                      <div key={parent.id} className="space-y-1">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isChecked}
                          className="w-full flex items-center gap-2 text-left cursor-pointer select-none py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 rounded-lg"
                          onClick={() => handleToggleCategory(parent.id, true)}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                          )}
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                            {parent.name}
                          </span>
                        </button>

                        {/* Indented subs */}
                        {hasSubs && (
                          <div className="pl-6 space-y-0.5 border-l-2 border-gray-100 dark:border-gray-800 ml-3.5">
                            {subs.map(sub => {
                              const isSubChecked = selectedCategoryIds.has(sub.id);
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isSubChecked}
                                  className="w-full flex items-center gap-2 text-left cursor-pointer select-none py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 rounded"
                                  onClick={() => handleToggleCategory(sub.id, false)}
                                >
                                  {isSubChecked ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                                  )}
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                    {sub.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Virtual Uncategorized checkbox */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={includeUncategorized}
                    className="w-full flex items-center gap-2 text-left cursor-pointer select-none py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 rounded-lg"
                    onClick={() => setIncludeUncategorized(!includeUncategorized)}
                  >
                    {includeUncategorized ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                    )}
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 italic">
                      Lançamentos Sem Categoria
                    </span>
                  </button>
                </div>
              </div>

              {/* Expenses group column */}
              <div className="space-y-3 bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-150 dark:border-gray-800">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <h3 className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4" />
                    Categorias de Despesas
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleGroup('despesa', true)}
                      className="text-[11px] text-gray-500 hover:text-emerald-600 font-semibold"
                    >
                      Todas
                    </button>
                    <span className="text-gray-300 dark:text-gray-700">|</span>
                    <button
                      type="button"
                      onClick={() => handleToggleGroup('despesa', false)}
                      className="text-[11px] text-gray-500 hover:text-rose-500 font-semibold"
                    >
                      Nenhuma
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {filteredRootDespesaCats.map(parent => {
                    const subs = getSubcategories(parent.id);
                    const isParentSelected = selectedCategoryIds.has(parent.id);
                    const hasSubs = subs.length > 0;
                    const allSubsSelected = hasSubs && subs.every(s => selectedCategoryIds.has(s.id));
                    const isChecked = isParentSelected && (!hasSubs || allSubsSelected);

                    return (
                      <div key={parent.id} className="space-y-1">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isChecked}
                          className="w-full flex items-center gap-2 text-left cursor-pointer select-none py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 rounded-lg"
                          onClick={() => handleToggleCategory(parent.id, true)}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                          )}
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                            {parent.name}
                          </span>
                        </button>

                        {/* Indented subs */}
                        {hasSubs && (
                          <div className="pl-6 space-y-0.5 border-l-2 border-gray-100 dark:border-gray-800 ml-3.5">
                            {subs.map(sub => {
                              const isSubChecked = selectedCategoryIds.has(sub.id);
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isSubChecked}
                                  className="w-full flex items-center gap-2 text-left cursor-pointer select-none py-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 rounded"
                                  onClick={() => handleToggleCategory(sub.id, false)}
                                >
                                  {isSubChecked ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                                  )}
                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                    {sub.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Executive Stat Summaries Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-3">
        {/* Receitas no Período */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Receitas Acumuladas
            </span>
            <span className="text-xl font-black font-mono block text-emerald-600 dark:text-emerald-400">
              +{formatCurrency(overallTotals.totalIncomesSum)}
            </span>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-2xl">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Despesas no Período */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Despesas Acumuladas
            </span>
            <span className="text-xl font-black font-mono block text-rose-600 dark:text-rose-400">
              -{formatCurrency(overallTotals.totalExpensesSum)}
            </span>
          </div>
          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-2xl">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* Resultado Operacional Líquido */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Resultado Líquido
            </span>
            <span className={`text-xl font-black font-mono block ${overallTotals.netResultSum >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {overallTotals.netResultSum >= 0 ? '+' : ''}{formatCurrency(overallTotals.netResultSum)}
            </span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-850 text-gray-500 rounded-2xl">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        {/* Intervalos & Margem */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Horizonte Temporal
            </span>
            <span className="text-xl font-black font-mono block text-gray-800 dark:text-gray-200">
              {buckets.length} {buckets.length === 1 ? 'coluna' : 'colunas'}
            </span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-850 text-gray-500 rounded-2xl">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. The Main Printable KMyMoney Style Matrix Report Sheet */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-800/80 rounded-3xl overflow-hidden shadow-xs print:border-none print:shadow-none">
        {/* Printable/PDF top banner */}
        <div className="text-center py-5 px-4 bg-gray-50/70 dark:bg-gray-950/40 border-b border-gray-200/80 dark:border-gray-800 print:py-3">
          <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white print:text-base">
            Demonstrativo de Receitas e Despesas ({periodicity === 'semanal' ? 'Semanal' : periodicity === 'mensal' ? 'Mensal' : 'Anual'})
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-semibold">
            {formatDate(startDateStr)} até {formatDate(endDateStr)}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">
            Valores exibidos em Reais (BRL)
          </p>
        </div>

        {/* Mobile scroll hint */}
        <div className="block sm:hidden text-center py-1.5 text-[11px] text-gray-500 bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30">
          ← Deslize horizontalmente para conferir todas as colunas →
        </div>

        {/* Scrollable table viewport */}
        <div className="overflow-x-auto print:overflow-x-visible">
          <table className="w-full border-collapse border-spacing-0" aria-label="Planilha de Relatório de Receitas e Despesas">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {/* Category Column */}
                <th scope="col" className="sticky left-0 bg-gray-50 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 py-3 px-4 z-20 min-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.02)] print:static print:shadow-none">
                  Categoria
                </th>
                
                {/* Bucket Columns */}
                {buckets.map(b => (
                  <th key={b.id} scope="col" className="py-3 px-4 border-r border-gray-150 dark:border-gray-800 text-center min-w-[110px] whitespace-nowrap font-mono text-xs">
                    {b.label}
                  </th>
                ))}

                {/* Total Column */}
                <th scope="col" className="py-3 px-5 text-right font-black text-gray-800 dark:text-gray-200 min-w-[130px] bg-gray-100/50 dark:bg-gray-850">
                  Total Acumulado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              
              {/* ==================== 1. RECEITAS SECTION ==================== */}
              <tr className="bg-emerald-50/40 dark:bg-emerald-950/20 border-y border-emerald-200/50 dark:border-emerald-800/40">
                <td 
                  colSpan={buckets.length + 2}
                  className="py-2 px-4 text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Receitas
                </td>
              </tr>

              {rootReceitaCats.map(parent => {
                const subs = getSubcategories(parent.id);
                const hasSubs = subs.length > 0;

                const isParentSelected = selectedCategoryIds.has(parent.id);
                let activeSubs = subs.filter(sub => selectedCategoryIds.has(sub.id));
                if (showOnlyWithMovement) {
                  activeSubs = activeSubs.filter(sub => getCategorySumAcrossBuckets(sub.id) !== 0);
                }

                if (!isParentSelected && activeSubs.length === 0) return null;

                if (showOnlyWithMovement) {
                  if (hasSubs) {
                    if (getParentGroupSumAcrossBuckets(parent.id) === 0) return null;
                  } else {
                    if (getCategorySumAcrossBuckets(parent.id) === 0) return null;
                  }
                }

                return (
                  <React.Fragment key={parent.id}>
                    {/* Parent Row */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-gray-150 dark:border-gray-800 py-2.5 px-4 z-10 text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.01)] print:static print:shadow-none">
                        <span className="flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate">{parent.name}</span>
                        </span>
                      </td>
                      
                      {buckets.map(b => {
                        const cellVal = reportData.categoryAmounts[parent.id]?.[b.id] ?? 0;
                        return (
                          <td key={b.id} className="py-2.5 px-4 text-center border-r border-gray-150 dark:border-gray-800">
                            {renderCellAmount(cellVal)}
                          </td>
                        );
                      })}

                      {/* Parent Direct Total */}
                      <td className="py-2.5 px-5 text-right font-bold bg-gray-50/40 dark:bg-gray-950/20">
                        {renderCellAmount(getCategorySumAcrossBuckets(parent.id), true)}
                      </td>
                    </tr>

                    {/* Subcategories (Indented) */}
                    {activeSubs.map(sub => {
                      return (
                        <tr key={sub.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors">
                          <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-gray-150 dark:border-gray-800 py-2 px-4 pl-9 z-10 text-xs text-gray-600 dark:text-gray-400 truncate max-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.01)] print:static print:shadow-none">
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                              <span className="truncate">{sub.name}</span>
                            </span>
                          </td>

                          {buckets.map(b => {
                            const cellVal = reportData.categoryAmounts[sub.id]?.[b.id] ?? 0;
                            return (
                              <td key={b.id} className="py-2 px-4 text-center border-r border-gray-150 dark:border-gray-800">
                                {renderCellAmount(cellVal)}
                              </td>
                            );
                          })}

                          {/* Subcategory Total */}
                          <td className="py-2 px-5 text-right bg-gray-50/20 dark:bg-gray-950/10">
                            {renderCellAmount(getCategorySumAcrossBuckets(sub.id))}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Group Total Row (Rendered if the parent category has subcategories) */}
                    {hasSubs && (
                      <tr className="bg-gray-50/70 dark:bg-gray-950/40 font-bold border-b border-gray-200 dark:border-gray-800">
                        <td className="sticky left-0 bg-gray-50/95 dark:bg-gray-950/95 border-r border-b border-gray-200 dark:border-gray-800 py-2 px-4 z-10 text-xs italic text-gray-600 dark:text-gray-400 pl-7 shadow-[2px_0_5px_rgba(0,0,0,0.02)] print:static print:shadow-none">
                          Subtotal {parent.name}
                        </td>
                        {buckets.map(b => {
                          const grpVal = reportData.parentCategoryAmounts[parent.id]?.[b.id] ?? 0;
                          return (
                            <td key={b.id} className="py-2 px-4 text-center border-r border-b border-gray-150 dark:border-gray-800 font-semibold">
                              {renderCellAmount(grpVal)}
                            </td>
                          );
                        })}
                        <td className="py-2 px-5 text-right font-black border-b border-gray-200 dark:border-gray-800 bg-gray-100/40 dark:bg-gray-900">
                          {renderCellAmount(getParentGroupSumAcrossBuckets(parent.id), true)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Uncategorized Receipts */}
              {includeUncategorized && (!showOnlyWithMovement || getUncatIncomeSum() !== 0) && (
                <tr className="hover:bg-gray-50/40 transition-colors">
                  <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-gray-150 dark:border-gray-800 py-2 px-4 z-10 text-xs text-gray-500 italic max-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.01)] print:static print:shadow-none">
                    Sem Categoria (Geral)
                  </td>
                  {buckets.map(b => {
                    const val = reportData.uncategorizedAmounts.receita[b.id] ?? 0;
                    return (
                      <td key={b.id} className="py-2 px-4 text-center border-r border-gray-150 dark:border-gray-800">
                        {renderCellAmount(val)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-5 text-right font-bold bg-gray-50/20">
                    {renderCellAmount(getUncatIncomeSum(), true)}
                  </td>
                </tr>
              )}

              {/* SECTION SUMMARY: TOTAL RECEITA */}
              <tr className="bg-emerald-50/60 dark:bg-emerald-950/40 font-black border-y-2 border-emerald-300 dark:border-emerald-800 text-xs">
                <td className="sticky left-0 bg-emerald-50/95 dark:bg-emerald-950/95 border-r border-emerald-300 dark:border-emerald-800 py-3 px-4 z-10 text-gray-900 dark:text-white font-black uppercase tracking-wider shadow-[2px_0_5px_rgba(0,0,0,0.02)] print:static print:shadow-none">
                  Total Receitas
                </td>
                {buckets.map(b => {
                  const val = reportData.totalReceita[b.id] ?? 0;
                  return (
                    <td key={b.id} className="py-3 px-4 text-center border-r border-emerald-200 dark:border-emerald-800/60 font-black">
                      {renderCellAmount(val, true)}
                    </td>
                  );
                })}
                <td className="py-3 px-5 text-right font-black bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  {renderCellAmount(overallTotals.totalIncomesSum, true)}
                </td>
              </tr>


              {/* ==================== 2. DESPESAS SECTION ==================== */}
              <tr className="bg-rose-50/40 dark:bg-rose-950/20 border-y border-rose-200/50 dark:border-rose-800/40">
                <td 
                  colSpan={buckets.length + 2}
                  className="py-2 px-4 text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  Despesas
                </td>
              </tr>

              {rootDespesaCats.map(parent => {
                const subs = getSubcategories(parent.id);
                const hasSubs = subs.length > 0;

                const isParentSelected = selectedCategoryIds.has(parent.id);
                let activeSubs = subs.filter(sub => selectedCategoryIds.has(sub.id));
                if (showOnlyWithMovement) {
                  activeSubs = activeSubs.filter(sub => getCategorySumAcrossBuckets(sub.id) !== 0);
                }

                if (!isParentSelected && activeSubs.length === 0) return null;

                if (showOnlyWithMovement) {
                  if (hasSubs) {
                    if (getParentGroupSumAcrossBuckets(parent.id) === 0) return null;
                  } else {
                    if (getCategorySumAcrossBuckets(parent.id) === 0) return null;
                  }
                }

                return (
                  <React.Fragment key={parent.id}>
                    {/* Parent Row */}
                    <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-gray-150 dark:border-gray-800 py-2.5 px-4 z-10 text-xs font-bold text-gray-800 dark:text-gray-200 truncate max-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.01)] print:static print:shadow-none">
                        <span className="flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="truncate">{parent.name}</span>
                        </span>
                      </td>
                      
                      {buckets.map(b => {
                        const cellVal = reportData.categoryAmounts[parent.id]?.[b.id] ?? 0;
                        return (
                          <td key={b.id} className="py-2.5 px-4 text-center border-r border-gray-150 dark:border-gray-800">
                            {renderCellAmount(cellVal)}
                          </td>
                        );
                      })}

                      {/* Parent Total */}
                      <td className="py-2.5 px-5 text-right font-bold bg-gray-50/40 dark:bg-gray-950/20">
                        {renderCellAmount(getCategorySumAcrossBuckets(parent.id), true)}
                      </td>
                    </tr>

                    {/* Subcategories */}
                    {activeSubs.map(sub => {
                      return (
                        <tr key={sub.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/20 transition-colors">
                          <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-gray-150 dark:border-gray-800 py-2 px-4 pl-9 z-10 text-xs text-gray-600 dark:text-gray-400 truncate max-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.01)] print:static print:shadow-none">
                            <span className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500/60 shrink-0" />
                              <span className="truncate">{sub.name}</span>
                            </span>
                          </td>

                          {buckets.map(b => {
                            const cellVal = reportData.categoryAmounts[sub.id]?.[b.id] ?? 0;
                            return (
                              <td key={b.id} className="py-2 px-4 text-center border-r border-gray-150 dark:border-gray-800">
                                {renderCellAmount(cellVal)}
                              </td>
                            );
                          })}

                          {/* Subcategory Total */}
                          <td className="py-2 px-5 text-right bg-gray-50/20 dark:bg-gray-950/10">
                            {renderCellAmount(getCategorySumAcrossBuckets(sub.id))}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Group Total Row */}
                    {hasSubs && (
                      <tr className="bg-gray-50/70 dark:bg-gray-950/40 font-bold border-b border-gray-200 dark:border-gray-800">
                        <td className="sticky left-0 bg-gray-50/95 dark:bg-gray-950/95 border-r border-b border-gray-200 dark:border-gray-800 py-2 px-4 z-10 text-xs italic text-gray-600 dark:text-gray-400 pl-7 shadow-[2px_0_5px_rgba(0,0,0,0.02)] print:static print:shadow-none">
                          Subtotal {parent.name}
                        </td>
                        {buckets.map(b => {
                          const grpVal = reportData.parentCategoryAmounts[parent.id]?.[b.id] ?? 0;
                          return (
                            <td key={b.id} className="py-2 px-4 text-center border-r border-b border-gray-150 dark:border-gray-800 font-semibold">
                              {renderCellAmount(grpVal)}
                            </td>
                          );
                        })}
                        <td className="py-2 px-5 text-right font-black border-b border-gray-200 dark:border-gray-800 bg-gray-100/40 dark:bg-gray-900">
                          {renderCellAmount(getParentGroupSumAcrossBuckets(parent.id), true)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Uncategorized Expenses */}
              {includeUncategorized && (!showOnlyWithMovement || getUncatExpenseSum() !== 0) && (
                <tr className="hover:bg-gray-50/40 transition-colors">
                  <td className="sticky left-0 bg-white dark:bg-gray-900 border-r border-gray-150 dark:border-gray-850 py-2 px-4 z-10 text-xs text-gray-500 italic max-w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.01)] print:static print:shadow-none">
                    Sem Categoria (Geral)
                  </td>
                  {buckets.map(b => {
                    const val = reportData.uncategorizedAmounts.despesa[b.id] ?? 0;
                    return (
                      <td key={b.id} className="py-2 px-4 text-center border-r border-gray-150 dark:border-gray-800">
                        {renderCellAmount(val)}
                      </td>
                    );
                  })}
                  <td className="py-2 px-5 text-right font-bold bg-gray-50/20">
                    {renderCellAmount(getUncatExpenseSum(), true)}
                  </td>
                </tr>
              )}

              {/* SECTION SUMMARY: TOTAL DESPESA */}
              <tr className="bg-rose-50/60 dark:bg-rose-950/40 font-black border-y-2 border-rose-300 dark:border-rose-800 text-xs">
                <td className="sticky left-0 bg-rose-50/95 dark:bg-rose-950/95 border-r border-rose-300 dark:border-rose-800 py-3 px-4 z-10 text-gray-900 dark:text-white font-black uppercase tracking-wider shadow-[2px_0_5px_rgba(0,0,0,0.02)] print:static print:shadow-none">
                  Total Despesas
                </td>
                {buckets.map(b => {
                  const val = reportData.totalDespesa[b.id] ?? 0;
                  return (
                    <td key={b.id} className="py-3 px-4 text-center border-r border-rose-200 dark:border-rose-800/60 font-black">
                      {renderCellAmount(val, true)}
                    </td>
                  );
                })}
                <td className="py-3 px-5 text-right font-black bg-rose-100/60 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                  {renderCellAmount(overallTotals.totalExpensesSum, true)}
                </td>
              </tr>


              {/* ==================== 3. TOTAL COMPLETO / RESULTADO LÍQUIDO ==================== */}
              <tr className="bg-gray-100/80 dark:bg-gray-950/80 border-t-4 border-double border-gray-300 dark:border-gray-700 font-black text-xs">
                <td className="sticky left-0 bg-gray-100/95 dark:bg-gray-950/95 border-r border-gray-300 dark:border-gray-800 py-3.5 px-4 z-10 text-gray-900 dark:text-white font-black uppercase tracking-wider shadow-[2px_0_5px_rgba(0,0,0,0.02)] print:static print:shadow-none">
                  Resultado Operacional Líquido
                </td>
                {buckets.map(b => {
                  const val = (reportData.totalReceita[b.id] ?? 0) - (reportData.totalDespesa[b.id] ?? 0);
                  return (
                    <td key={b.id} className="py-3.5 px-4 text-center border-r border-gray-200 dark:border-gray-800 font-black">
                      {renderCellAmount(val, true)}
                    </td>
                  );
                })}
                <td className={`py-3.5 px-5 text-right font-black ${
                  overallTotals.netResultSum >= 0 ? 'bg-emerald-100/60 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100/60 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300'
                }`}>
                  {renderCellAmount(overallTotals.netResultSum, true)}
                </td>
              </tr>

            </tbody>
          </table>
        </div>

        {/* Warning if no columns shown */}
        {buckets.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 flex flex-col items-center justify-center gap-2 p-6">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <p className="text-sm font-semibold">Período de datas inválido ou nenhum intervalo de tempo gerado.</p>
            <p className="text-xs text-gray-500">Por favor, verifique se a data de início é anterior ou igual à data de fim.</p>
            <button
              type="button"
              onClick={() => applyPreset('ano-atual')}
              className="mt-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer"
            >
              Restaurar Período Padrão
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
