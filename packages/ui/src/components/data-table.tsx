"use client";

import ArrowDown from "@carbon/icons-react/es/ArrowDown";
import ArrowsVertical from "@carbon/icons-react/es/ArrowsVertical";
import ArrowUp from "@carbon/icons-react/es/ArrowUp";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import Column from "@carbon/icons-react/es/Column";
import Filter from "@carbon/icons-react/es/Filter";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Spinner } from "@crm/ui/components/spinner";
import { TablePagination } from "@crm/ui/components/table-pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import type { TableSelection } from "@crm/ui/hooks/use-table-selection";
import { ROW_ACCENT, ROW_ACCENT_EXPANDABLE } from "@crm/ui/lib/row-accent";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { cn } from "@crm/ui/lib/utils";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import {
	Fragment,
	type ReactNode,
	useDeferredValue,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";

export type DataTableColumn<TRow> = {
	id: string;
	header: ReactNode;
	cell: (row: TRow) => ReactNode;
	label?: string;
	sortable?: boolean;
	width?: string;
	align?: "left" | "right" | "center";
	headClassName?: string;
	cellClassName?: string;
	hideable?: boolean;
	defaultHidden?: boolean;
	hideBelow?: "sm" | "md" | "lg";
};

export type DataTableFacet = {
	id: string;
	label: string;
	options: { value: string; label: string }[];
	searchable?: boolean;
	search?: string;
	onSearchChange?: (search: string) => void;
	stale?: boolean;
	empty?: ReactNode;
};

export type DataTableTabs = {
	id: string;
	allLabel?: string;
	options: { value: string; label: string }[];
};

export type DataTableExpandable<TRow, TSub> = {
	isExpandable: (row: TRow) => boolean;
	getSubRows: (row: TRow) => TSub[];
	getSubRowId: (sub: TSub, row: TRow) => string;
	renderSubCell: (sub: TSub, columnId: string, row: TRow) => ReactNode;
	onSubRowClick?: (sub: TSub, row: TRow) => void;
};

export type DataTableSelection<TRow> = {
	state: TableSelection;
	actions: ReactNode;
	rowLabel?: (row: TRow) => string;
};

export type DataTableProps<TRow, TSub> = {
	query: TableQueryState;
	columns: DataTableColumn<TRow>[];
	getRowId: (row: TRow) => string;
	rows: TRow[];
	total: number;
	facetCounts?: Record<string, Record<string, number>>;
	loading?: boolean;
	facets?: DataTableFacet[];
	tabs?: DataTableTabs;
	onRowClick?: (row: TRow) => void;
	onRowHover?: (row: TRow) => void;
	expandable?: DataTableExpandable<TRow, TSub>;
	selection?: DataTableSelection<TRow>;
	actions?: ReactNode;
	leadingActions?: ReactNode;
	search?: ReactNode;
	meta?: ReactNode;
	empty?: ReactNode;
	className?: string;
	tableClassName?: string;
	storageKey?: string;
};

const HIDE_BELOW_CLASS = {
	sm: "hidden sm:table-cell",
	md: "hidden md:table-cell",
	lg: "hidden lg:table-cell",
} as const;

const ALIGN_CLASS = {
	left: "",
	right: "text-right",
	center: "text-center",
} as const;

const DEFAULT_COLUMN_WIDTH_REM = 11;
export const MIN_COLUMN_WIDTH_REM = 6;
export const MAX_COLUMN_WIDTH_REM = 40;

export function resizeColumnWidth(current: number, delta: number): number {
	return Math.min(
		MAX_COLUMN_WIDTH_REM,
		Math.max(MIN_COLUMN_WIDTH_REM, Math.round((current + delta) * 10) / 10),
	);
}

export function readStoredWidths(key?: string): Record<string, number> {
	if (!key || typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const result: Record<string, number> = {};
			for (const [colId, val] of Object.entries(parsed)) {
				if (typeof val === "number" && !Number.isNaN(val)) {
					result[colId] = Math.min(
						MAX_COLUMN_WIDTH_REM,
						Math.max(MIN_COLUMN_WIDTH_REM, val),
					);
				}
			}
			return result;
		}
	} catch {
		return {};
	}
	return {};
}

export function writeStoredWidths(
	key: string | undefined,
	widths: Record<string, number>,
): void {
	if (!key || typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, JSON.stringify(widths));
	} catch {}
}

function parseWidthRem(width?: string): number {
	if (!width) return DEFAULT_COLUMN_WIDTH_REM;
	const remMatch = width.match(/(\d+(?:\.\d+)?)rem/);
	if (remMatch?.[1]) return parseFloat(remMatch[1]);
	const pxMatch = width.match(/(\d+(?:\.\d+)?)px/);
	if (pxMatch?.[1]) return parseFloat(pxMatch[1]) / 16;
	const twMatch = width.match(/^w-(\d+)$/);
	if (twMatch?.[1]) return parseInt(twMatch[1], 10) / 4;
	return DEFAULT_COLUMN_WIDTH_REM;
}

function columnLabel<TRow>(column: DataTableColumn<TRow>): string {
	if (column.label) return column.label;
	return typeof column.header === "string" ? column.header : column.id;
}

function SortIndicator({
	active,
	dir,
}: {
	active: boolean;
	dir: "asc" | "desc";
}) {
	return (
		<span className="text-muted-foreground">
			{active ? (
				dir === "asc" ? (
					<ArrowUp size={12} />
				) : (
					<ArrowDown size={12} />
				)
			) : (
				<ArrowsVertical size={12} className="opacity-40" />
			)}
		</span>
	);
}

function facetLabel(facet: DataTableFacet, selected: string[]): string {
	if (selected.length === 0) return facet.label;
	if (selected.length === 1) {
		const option = facet.options.find((o) => o.value === selected[0]);
		return option?.label ?? facet.label;
	}
	return `${facet.label} (${selected.length})`;
}

function toggle(selected: string[], value: string, checked: boolean): string[] {
	return checked ? [...selected, value] : selected.filter((v) => v !== value);
}

function FacetSubmenu({
	facet,
	selected,
	onChange,
}: {
	facet: DataTableFacet;
	selected: string[];
	onChange: (values: string[]) => void;
}) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<span className="flex-1">{facet.label}</span>
				{selected.length > 0 && (
					<span className="tabular-nums opacity-60">({selected.length})</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-h-72 min-w-52 overflow-hidden">
				{facet.searchable ? (
					<Command
						shouldFilter={facet.onSearchChange === undefined}
						className="max-h-72"
					>
						<CommandInput
							placeholder={`Search ${facet.label.toLowerCase()}…`}
							value={facet.search}
							onValueChange={facet.onSearchChange}
							onKeyDown={(event) => event.stopPropagation()}
						/>
						<CommandList>
							<CommandEmpty>{facet.empty ?? "Nothing matches."}</CommandEmpty>
							<CommandGroup>
								{facet.options.map((option) => {
									const checked = selected.includes(option.value);
									return (
										<CommandItem
											key={option.value}
											value={option.label}
											disabled={facet.stale}
											data-checked={checked}
											onSelect={() =>
												onChange(toggle(selected, option.value, !checked))
											}
										>
											<Checkbox
												checked={checked}
												className="pointer-events-none"
											/>
											<span className="truncate">{option.label}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				) : (
					<div className="max-h-72 overflow-y-auto">
						{selected.length > 0 && (
							<>
								<DropdownMenuItem onSelect={() => onChange([])}>
									Clear
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}
						{facet.options.map((option) => {
							const checked = selected.includes(option.value);
							return (
								<DropdownMenuCheckboxItem
									key={option.value}
									checked={checked}
									onSelect={(event) => event.preventDefault()}
									onCheckedChange={(next) =>
										onChange(toggle(selected, option.value, next))
									}
								>
									{option.label}
								</DropdownMenuCheckboxItem>
							);
						})}
					</div>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function DataTable<TRow, TSub = unknown>({
	query,
	columns,
	getRowId,
	rows,
	total,
	facetCounts,
	loading,
	facets,
	tabs,
	onRowClick,
	onRowHover,
	expandable,
	selection,
	actions,
	leadingActions,
	search,
	meta,
	empty,
	className,
	tableClassName,
	storageKey,
}: DataTableProps<TRow, TSub>) {
	const [expandedIds, setExpandedIds] = useQueryState(
		"expand",
		parseAsArrayOf(parseAsString).withDefault([]),
	);
	const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
	const defaultHiddenIds = useMemo(
		() => columns.filter((column) => column.defaultHidden).map((c) => c.id),
		[columns],
	);
	const [hidden, setHidden] = useQueryState(
		"hide",
		parseAsArrayOf(parseAsString).withDefault(defaultHiddenIds),
	);
	const [isScrolled, setIsScrolled] = useState(false);
	const isResizable = Boolean(storageKey);
	const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

	useEffect(() => {
		if (!storageKey) return;
		const stored = readStoredWidths(storageKey);
		if (Object.keys(stored).length > 0) {
			setColumnWidths(stored);
		}
	}, [storageKey]);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filtersId = useId();

	const updateColumnWidth = (columnId: string, width: number) => {
		const clamped = resizeColumnWidth(width, 0);
		setColumnWidths((prev) => {
			const next = { ...prev, [columnId]: clamped };
			writeStoredWidths(storageKey, next);
			return next;
		});
	};

	const startResize = (
		columnId: string,
		startWidth: number,
		event: React.PointerEvent,
	) => {
		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;

		const handlePointerMove = (e: PointerEvent) => {
			const deltaPx = e.clientX - startX;
			const deltaRem = deltaPx / 16;
			updateColumnWidth(columnId, startWidth + deltaRem);
		};

		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	const handleResizeKey = (
		columnId: string,
		currentWidth: number,
		event: React.KeyboardEvent,
	) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			event.stopPropagation();
			updateColumnWidth(columnId, currentWidth - 1);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			event.stopPropagation();
			updateColumnWidth(columnId, currentWidth + 1);
		}
	};

	const hideable = columns.filter((column) => column.hideable !== false);
	const visibleColumns = columns.filter(
		(column) => !hidden.includes(column.id),
	);
	const sortableColumns = columns.filter((column) => column.sortable);

	const tabCounts = tabs ? facetCounts?.[tabs.id] : undefined;
	const activeTabOption =
		query.tab === "all"
			? undefined
			: tabs?.options.find((option) => option.value === query.tab);
	const activeTabLabel = activeTabOption
		? activeTabOption.label
		: (tabs?.allLabel ?? "All");

	const deferredRows = useDeferredValue(rows);
	const anyExpandable =
		expandable != null &&
		deferredRows.some((row) => expandable.isExpandable(row));
	const selecting = selection != null && selection.state.count > 0;

	const pageSize = query.pageSize;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const availableFacets = useMemo(
		() =>
			(facets ?? []).filter(
				(facet) =>
					facet.options.length > 0 ||
					facet.searchable ||
					(query.filters[facet.id]?.length ?? 0) > 0,
			),
		[facets, query.filters],
	);

	const hasFilterControls =
		tabs != null ||
		availableFacets.length > 0 ||
		sortableColumns.length > 0 ||
		anyExpandable ||
		hideable.length > 0 ||
		actions != null ||
		leadingActions != null;
	const activeFacetFilterCount = availableFacets.filter(
		(facet) => (query.filters[facet.id]?.length ?? 0) > 0,
	).length;
	const activeFilterCount =
		(tabs && query.tab !== "all" ? 1 : 0) + activeFacetFilterCount;

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
			{selecting && selection ? (
				<div className="flex h-8 items-center gap-2">
					<span className="truncate text-xs text-muted-foreground">
						<span className="font-medium text-foreground tabular-nums">
							{selection.state.count}
						</span>{" "}
						selected
					</span>
					<div className="ml-auto flex items-center gap-2">
						{selection.actions}
						<Button
							variant="ghost"
							size="sm"
							onClick={() => selection.state.clear()}
						>
							Clear
						</Button>
					</div>
				</div>
			) : null}
			<div
				className={cn(
					"flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between",
					selecting && "hidden",
				)}
			>
				{search}
				{hasFilterControls && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full justify-between sm:hidden"
						aria-expanded={filtersOpen}
						aria-controls={filtersId}
						onClick={() => setFiltersOpen((open) => !open)}
					>
						<span className="flex items-center gap-2">
							<Filter />
							Filters
							{activeFilterCount > 0 && (
								<span className="tabular-nums opacity-60">
									({activeFilterCount})
								</span>
							)}
						</span>
						<ChevronDown
							className={cn(
								"shrink-0 opacity-60 transition-transform",
								filtersOpen && "rotate-180",
							)}
						/>
					</Button>
				)}
				{/* `lg:contents` so the controls join the search on one row on desktop
				    while staying a group the Filters button can collapse on mobile —
				    search itself must never be inside that collapse. */}
				<div
					id={filtersId}
					className={cn(
						"flex-col gap-2 lg:contents",
						filtersOpen ? "flex" : "hidden sm:flex",
					)}
				>
					{tabs && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="w-full justify-between sm:w-auto sm:min-w-44"
								>
									<span className="truncate">{activeTabLabel}</span>
									<ChevronDown className="shrink-0 opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="min-w-52">
								<DropdownMenuRadioGroup
									value={query.tab}
									onValueChange={(value) => query.setTab(value)}
								>
									<DropdownMenuRadioItem value="all">
										<span className="flex-1">{tabs.allLabel ?? "All"}</span>
									</DropdownMenuRadioItem>
									{tabs.options.map((option) => {
										if (tabCounts?.[option.value] === 0) return null;
										return (
											<DropdownMenuRadioItem
												key={option.value}
												value={option.value}
											>
												<span className="flex-1">{option.label}</span>
											</DropdownMenuRadioItem>
										);
									})}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{leadingActions}

					<div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center lg:ml-auto">
						{availableFacets.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="justify-start sm:justify-center"
									>
										<Filter data-icon="inline-start" />
										Filters
										{activeFacetFilterCount > 0 && (
											<span className="tabular-nums opacity-60">
												({activeFacetFilterCount})
											</span>
										)}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start" className="min-w-48">
									{availableFacets.map((facet) => (
										<FacetSubmenu
											key={facet.id}
											facet={facet}
											selected={query.filters[facet.id] ?? []}
											onChange={(values) => query.setFilter(facet.id, values)}
										/>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{(sortableColumns.length > 0 || anyExpandable) && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="justify-start sm:justify-center"
									>
										<ArrowsVertical data-icon="inline-start" />
										Sort
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuLabel>Sort by</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										value={query.sort}
										onValueChange={query.setSort}
									>
										{anyExpandable && (
											<DropdownMenuRadioItem value="detail">
												Detail
											</DropdownMenuRadioItem>
										)}
										{sortableColumns.map((column) => (
											<DropdownMenuRadioItem key={column.id} value={column.id}>
												{columnLabel(column)}
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
									<DropdownMenuSeparator />
									<DropdownMenuRadioGroup
										value={query.dir}
										onValueChange={(value) =>
											query.setDir(value === "desc" ? "desc" : "asc")
										}
									>
										<DropdownMenuRadioItem value="asc">
											Ascending
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="desc">
											Descending
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{hideable.length > 0 && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="justify-start sm:justify-center"
									>
										<Column data-icon="inline-start" />
										Columns
										<span className="tabular-nums opacity-60">
											({visibleColumns.length})
										</span>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
									{hideable.map((column) => (
										<DropdownMenuCheckboxItem
											key={column.id}
											checked={!hidden.includes(column.id)}
											onCheckedChange={(checked) =>
												setHidden((prev) => {
													const set = new Set(prev);
													if (checked) set.delete(column.id);
													else set.add(column.id);
													return [...set];
												})
											}
										>
											{columnLabel(column)}
										</DropdownMenuCheckboxItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{actions}
					</div>
				</div>
			</div>

			<Table
				className={cn(
					isResizable ? "table-fixed w-max min-w-full" : "table-fixed w-full",
					"[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4",
					tableClassName,
				)}
				containerClassName="min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
				onScroll={
					isResizable ? (e) => setIsScrolled(e.currentTarget.scrollLeft > 0) : undefined
				}
				overlay={
					deferredRows.length === 0 ? (
						<div className="absolute inset-x-0 top-11 bottom-0 flex items-center justify-center px-4 py-8 text-center text-muted-foreground">
							{loading ? <Spinner /> : (empty ?? "No results found.")}
						</div>
					) : null
				}
			>
				<TableHeader
					className={cn(
						"sticky top-0 bg-muted [&_th]:bg-muted [&_tr]:border-0 [&_tr]:shadow-[inset_0_-1px_0_var(--border)]",
						isResizable ? "z-20" : "z-10",
					)}
				>
					<TableRow>
						{selection && (
							<TableHead
								className={cn(
									isResizable
										? "sticky left-0 z-30 bg-muted h-11 w-10 px-3"
										: "h-11 w-10 px-3",
									HIDE_BELOW_CLASS.sm,
								)}
								style={
									isResizable
										? { width: "2.5rem", minWidth: "2.5rem", maxWidth: "2.5rem" }
										: undefined
								}
							>
								<Checkbox
									checked={
										selection.state.allSelected
											? true
											: selection.state.someSelected
												? "indeterminate"
												: false
									}
									onCheckedChange={(checked) =>
										selection.state.toggleAll(checked === true)
									}
									disabled={deferredRows.length === 0}
									aria-label="Select every row on this page"
								/>
							</TableHead>
						)}
						{anyExpandable && (
							<TableHead className="h-11 w-10 px-3">
								<span className="sr-only">Detail</span>
							</TableHead>
						)}
						{visibleColumns.map((column, index) => {
							const isFirst = index === 0;
							const widthRem =
								columnWidths[column.id] ?? parseWidthRem(column.width);
							const isClassWidth =
								column.width &&
								(column.width.startsWith("w-") || column.width.includes(" "));
							const stickyHeadClass =
								isResizable && isFirst
									? cn(
											"sticky z-30 bg-muted",
											selection ? "left-0 sm:left-10" : "left-0",
											isScrolled &&
												"shadow-[inset_-1px_0_0_var(--border),2px_0_4px_-2px_rgba(0,0,0,0.12)]",
										)
									: undefined;
							const isActive = query.sort === column.id;
							return (
								<TableHead
									key={column.id}
									style={
										isResizable
											? {
													width: `${widthRem}rem`,
													minWidth: `${widthRem}rem`,
													maxWidth: `${widthRem}rem`,
												}
											: undefined
									}
									className={cn(
										"relative h-11 overflow-hidden px-3 font-normal text-muted-foreground",
										(!isResizable || isClassWidth) && column.width,
										ALIGN_CLASS[column.align ?? "left"],
										column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
										column.headClassName,
										stickyHeadClass,
									)}
									aria-sort={
										isActive
											? query.dir === "asc"
												? "ascending"
												: "descending"
											: undefined
									}
								>
									{column.sortable ? (
										<Button
											variant="ghost"
											size="xs"
											onClick={() => query.toggleSort(column.id)}
											className={cn(
												"-ml-2 font-normal text-muted-foreground hover:text-foreground",
												column.align === "right" && "-mr-2 ml-0 flex-row-reverse",
												column.align === "center" && "mx-auto",
											)}
										>
											{column.header}
											<SortIndicator active={isActive} dir={query.dir} />
										</Button>
									) : (
										column.header
									)}
									{isResizable && (
										<div
											role="separator"
											aria-orientation="vertical"
											aria-label={`Resize ${columnLabel(column)} column`}
											aria-valuenow={Math.round(widthRem)}
											aria-valuemin={MIN_COLUMN_WIDTH_REM}
											aria-valuemax={MAX_COLUMN_WIDTH_REM}
											tabIndex={0}
											onPointerDown={(event) =>
												startResize(column.id, widthRem, event)
											}
											onKeyDown={(event) =>
												handleResizeKey(column.id, widthRem, event)
											}
											onClick={(event) => event.stopPropagation()}
											className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none hover:bg-border/60 focus-visible:bg-primary focus-visible:outline-none"
										/>
									)}
								</TableHead>
							);
						})}
					</TableRow>
				</TableHeader>
				<TableBody>
					{deferredRows.map((row) => {
						const id = getRowId(row);
						const canExpand = expandable?.isExpandable(row) ?? false;
						const isOpen = canExpand && expanded.has(id);
						const isSelected = selection?.state.has(id) ?? false;
						const clickable = canExpand || !!onRowClick;
						const handleClick = () => {
							if (canExpand) {
								setExpandedIds((prev) => {
									const set = new Set(prev ?? []);
									if (set.has(id)) set.delete(id);
									else set.add(id);
									const next = [...set];
									return next.length > 0 ? next : null;
								});
							} else {
								onRowClick?.(row);
							}
						};
						return (
							<Fragment key={id}>
								<TableRow
									data-state={isSelected ? "selected" : undefined}
									onClick={clickable ? handleClick : undefined}
									onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
									onFocus={onRowHover ? () => onRowHover(row) : undefined}
									className={cn(
										"group",
										clickable
											? anyExpandable
												? ROW_ACCENT_EXPANDABLE
												: ROW_ACCENT
											: undefined,
									)}
								>
									{selection && (
										<TableCell
											className={cn(
												isResizable
													? "sticky left-0 z-10 bg-card group-hover:bg-muted/60 group-data-[state=selected]:bg-muted w-10 px-3 py-3"
													: "w-10 px-3 py-3",
												HIDE_BELOW_CLASS.sm,
											)}
											style={
												isResizable
													? {
															width: "2.5rem",
															minWidth: "2.5rem",
															maxWidth: "2.5rem",
														}
													: undefined
											}
											onClick={(event) => event.stopPropagation()}
										>
											<Checkbox
												checked={isSelected}
												onCheckedChange={(checked) =>
													selection.state.toggle(id, checked === true)
												}
												aria-label={
													selection.rowLabel
														? `Select ${selection.rowLabel(row)}`
														: "Select row"
												}
											/>
										</TableCell>
									)}
									{anyExpandable && (
										<TableCell className="w-10 px-3 py-3 text-center text-muted-foreground">
											{canExpand && (
												<ChevronRight
													size={12}
													className={cn(
														"inline-block transition-transform",
														isOpen && "rotate-90",
													)}
												/>
											)}
										</TableCell>
									)}
									{visibleColumns.map((column, index) => {
										const isFirst = index === 0;
										const widthRem =
											columnWidths[column.id] ?? parseWidthRem(column.width);
										const isClassWidth =
											column.width &&
											(column.width.startsWith("w-") ||
												column.width.includes(" "));
										const stickyCellClass =
											isResizable && isFirst
												? cn(
														"sticky z-10 bg-card group-hover:bg-muted/60 group-data-[state=selected]:bg-muted",
														selection ? "left-0 sm:left-10" : "left-0",
														isScrolled &&
															"shadow-[inset_-1px_0_0_var(--border),2px_0_4px_-2px_rgba(0,0,0,0.12)]",
													)
												: undefined;
										return (
											<TableCell
												key={column.id}
												style={
													isResizable
														? {
																width: `${widthRem}rem`,
																minWidth: `${widthRem}rem`,
																maxWidth: `${widthRem}rem`,
															}
														: undefined
												}
												className={cn(
													"overflow-hidden px-3 py-3",
													(!isResizable || isClassWidth) && column.width,
													ALIGN_CLASS[column.align ?? "left"],
													column.hideBelow && HIDE_BELOW_CLASS[column.hideBelow],
													column.cellClassName,
													stickyCellClass,
												)}
											>
												{column.cell(row)}
											</TableCell>
										);
									})}
								</TableRow>
								{isOpen &&
									expandable?.getSubRows(row).map((sub) => {
										const subClickable = !!expandable.onSubRowClick;
										return (
											<TableRow
												key={expandable.getSubRowId(sub, row)}
												onClick={
													subClickable
														? () => expandable.onSubRowClick?.(sub, row)
														: undefined
												}
												className={cn(
													"group bg-muted/30",
													subClickable &&
														(anyExpandable
															? ROW_ACCENT_EXPANDABLE
															: ROW_ACCENT),
												)}
											>
												{selection && (
													<TableCell
														className={cn(
															isResizable
																? "sticky left-0 z-10 bg-muted/30 w-10 px-3 py-2.5"
																: "w-10 px-3 py-2.5",
															HIDE_BELOW_CLASS.sm,
														)}
														style={
															isResizable
																? {
																		width: "2.5rem",
																		minWidth: "2.5rem",
																		maxWidth: "2.5rem",
																	}
																: undefined
														}
													/>
												)}
												{anyExpandable && (
													<TableCell className="w-10 px-3 py-2.5" />
												)}
												{visibleColumns.map((column, index) => {
													const isFirst = index === 0;
													const widthRem =
														columnWidths[column.id] ?? parseWidthRem(column.width);
													const isClassWidth =
														column.width &&
														(column.width.startsWith("w-") ||
															column.width.includes(" "));
													const stickySubCellClass =
														isResizable && isFirst
															? cn(
																	"sticky z-10 bg-muted/30 group-hover:bg-muted/60",
																	selection ? "left-0 sm:left-10" : "left-0",
																	isScrolled &&
																		"shadow-[inset_-1px_0_0_var(--border),2px_0_4px_-2px_rgba(0,0,0,0.12)]",
																)
															: undefined;
													return (
														<TableCell
															key={column.id}
															style={
																isResizable
																	? {
																			width: `${widthRem}rem`,
																			minWidth: `${widthRem}rem`,
																			maxWidth: `${widthRem}rem`,
																		}
																	: undefined
															}
															className={cn(
																"overflow-hidden px-3 py-2.5 align-top",
																(!isResizable || isClassWidth) && column.width,
																ALIGN_CLASS[column.align ?? "left"],
																column.hideBelow &&
																	HIDE_BELOW_CLASS[column.hideBelow],
																column.cellClassName,
																stickySubCellClass,
															)}
														>
															{expandable.renderSubCell(sub, column.id, row)}
														</TableCell>
													);
												})}
											</TableRow>
										);
									})}
							</Fragment>
						);
					})}
				</TableBody>
			</Table>

			<TablePagination
				page={query.page}
				totalPages={totalPages}
				pageSize={pageSize}
				total={total}
				onPageChange={(page) => query.setPage(page)}
				loading={loading}
				meta={meta}
			/>
		</div>
	);
}
