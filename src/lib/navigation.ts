import {
  LayoutDashboard,
  Landmark,
  ArrowLeftRight,
  FolderTree,
  Tag,
  Upload,
  CalendarClock,
  Users,
  LineChart,
  FileSpreadsheet,
  Cloud,
  type LucideIcon,
} from 'lucide-react';

export type ViewId =
  | 'dashboard'
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'tags'
  | 'payees'
  | 'recurring'
  | 'forecast'
  | 'report'
  | 'import'
  | 'backup';

export interface NavItem {
  id: ViewId;
  name: string;
  shortName?: string;
  icon: LucideIcon;
  keywords?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Visão geral',
    items: [
      { id: 'dashboard', name: 'Painel', shortName: 'Painel', icon: LayoutDashboard, keywords: 'dashboard inicio resumo' },
      { id: 'forecast', name: 'Previsão de Caixa', shortName: 'Previsão', icon: LineChart, keywords: 'futuro projeção fluxo' },
      { id: 'report', name: 'Relatório de Caixa', shortName: 'Relatório', icon: FileSpreadsheet, keywords: 'relatorio anual mensal' },
    ],
  },
  {
    label: 'Movimentação',
    items: [
      { id: 'transactions', name: 'Transações', shortName: 'Transações', icon: ArrowLeftRight, keywords: 'lançamentos extrato' },
      { id: 'recurring', name: 'Agenda Recorrente', shortName: 'Agenda', icon: CalendarClock, keywords: 'contas a pagar recorrentes' },
      { id: 'accounts', name: 'Contas Correntes', shortName: 'Contas', icon: Landmark, keywords: 'bancos saldos' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { id: 'categories', name: 'Categorias', icon: FolderTree },
      { id: 'tags', name: 'Etiquetas', icon: Tag, keywords: 'tags' },
      { id: 'payees', name: 'Beneficiários', icon: Users, keywords: 'favorecidos fornecedores' },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { id: 'import', name: 'Importação QIF/CSV', icon: Upload, keywords: 'importar arquivo extrato ofx' },
      { id: 'backup', name: 'Backup & Restauração', icon: Cloud, keywords: 'google drive restaurar' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Primary destinations shown in the mobile bottom bar */
export const MOBILE_PRIMARY: ViewId[] = ['dashboard', 'transactions', 'recurring', 'forecast'];

export function isViewId(value: string): value is ViewId {
  return NAV_ITEMS.some((i) => i.id === value);
}

export function getNavItem(id: ViewId): NavItem {
  return NAV_ITEMS.find((i) => i.id === id)!;
}
