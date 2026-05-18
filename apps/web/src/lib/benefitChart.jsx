import { Sector } from 'recharts';

export const AVAILABLE_BUDGET_COLOR = '#E8E2D6';

const chartCurrency = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' });

const namedBenefitColors = new Map([
  ['yoga-kurs', '#719C6F'],
  ['wiener öffi-ticket', '#4F7CAC'],
  ['fitness-zuschuss', '#E7C84B'],
  ['weiterbildung', '#D978A0'],
  ['gesundheitscheck', '#8C6BB1'],
  ['homeoffice-ausstattung', '#4F9A94'],
  ['essens-/verpflegungszuschuss', '#E06F6A'],
]);

const fallbackBenefitColors = [
  '#719C6F',
  '#4F7CAC',
  '#E7C84B',
  '#D978A0',
  '#8C6BB1',
  '#4F9A94',
  '#E06F6A',
  '#6B88D6',
  '#96A85B',
  '#C86F8F',
  '#78A6B8',
  '#B884C7',
];

const RADIAN = Math.PI / 180;

function normalizeName(value) {
  return String(value || '').normalize('NFC').trim().toLowerCase();
}

function hashString(value) {
  return Array.from(String(value || 'benefit')).reduce((hash, char) => (
    ((hash << 5) - hash + char.charCodeAt(0)) | 0
  ), 0);
}

export function benefitChartName(item) {
  if (item?.isCustomBenefit) {
    return item.customTitle || 'Eigener Benefit';
  }

  return item?.benefit?.title || 'Benefit';
}

export function benefitChartColor(item) {
  const name = benefitChartName(item);
  const namedColor = namedBenefitColors.get(normalizeName(name));
  if (namedColor) {
    return namedColor;
  }

  const stableKey = item?.benefitId || item?.id || name;
  return fallbackBenefitColors[Math.abs(hashString(stableKey)) % fallbackBenefitColors.length];
}

export function buildBenefitChartData(selectedBenefits, remainingBudget, totalBudget) {
  const segments = selectedBenefits
    .map((item) => ({
      id: item.benefitId ? `benefit-${item.benefitId}` : `custom-${item.id}`,
      name: benefitChartName(item),
      value: item.coveredAmount || 0,
      color: benefitChartColor(item),
    }))
    .filter((item) => item.value > 0);

  if (remainingBudget > 0) {
    segments.push({
      id: 'available-budget',
      name: 'Noch verfügbar',
      value: remainingBudget,
      color: AVAILABLE_BUDGET_COLOR,
    });
  }

  return segments.length
    ? segments
    : [{ id: 'available-budget', name: 'Noch verfügbar', value: totalBudget, color: AVAILABLE_BUDGET_COLOR }];
}

export function ActivePieCallout(props) {
  const {
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
  } = props;

  const cos = Math.cos(-RADIAN * midAngle);
  const sin = Math.sin(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 6) * cos;
  const sy = cy + (outerRadius + 6) * sin;
  const ex = cx + (outerRadius + 22) * cos;
  const ey = cy + (outerRadius + 22) * sin;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="transparent"
      />
      <path d={`M${sx},${sy}L${ex},${ey}`} fill="none" stroke={fill} strokeWidth={2} />
      <circle cx={ex} cy={ey} r={3} fill={fill} />
    </g>
  );
}

export function ChartSegmentCallout({ data, activeIndex }) {
  if (activeIndex === null || activeIndex === undefined || !data?.[activeIndex]) {
    return null;
  }

  const activeItem = data[activeIndex];
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  if (total <= 0) {
    return null;
  }

  const previous = data.slice(0, activeIndex).reduce((sum, item) => sum + (item.value || 0), 0);
  const midAngle = -90 + ((previous + (activeItem.value || 0) / 2) / total) * 360;
  const cos = Math.cos(RADIAN * midAngle);
  const sin = Math.sin(RADIAN * midAngle);
  const distance = 9.7;
  const left = `calc(50% + ${cos * distance}rem)`;
  const top = `calc(50% + ${sin * distance}rem)`;
  const horizontal = Math.abs(cos) >= Math.abs(sin);
  const transform = horizontal
    ? `translate(${cos >= 0 ? '0' : '-100%'}, -50%)`
    : `translate(-50%, ${sin >= 0 ? '0' : '-100%'})`;

  return (
    <div
      className="pointer-events-none absolute z-20 w-44 rounded-lg border bg-white px-3 py-2 text-[#222222] shadow-xl"
      style={{ borderColor: activeItem.color, left, top, transform }}
    >
      <div className="truncate text-xs font-bold">{activeItem.name}</div>
      <div className="mt-1 text-sm font-extrabold">{chartCurrency.format(activeItem.value || 0)}</div>
    </div>
  );
}
