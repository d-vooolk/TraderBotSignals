import QuickChart from 'quickchart-js';

const lineAt = (x, x1, y1, x2, y2) => y1 + (y2 - y1) * (x - x1) / (x2 - x1);

export const generateTrendlineChart = async (coinSymbol, closes, resistLine, supportLine, direction) => {
  const n = closes.length;
  const labels = closes.map(() => '');

  const pivotColors = {};
  if (resistLine) {
    pivotColors[resistLine.p1.idx] = '#ff5555';
    pivotColors[resistLine.p2.idx] = '#ff5555';
  }
  if (supportLine) {
    pivotColors[supportLine.p1.idx] = '#44cc88';
    pivotColors[supportLine.p2.idx] = '#44cc88';
  }

  const datasets = [
    {
      label: `${coinSymbol}/USDT`,
      data: closes,
      borderColor: '#c8c8d4',
      borderWidth: 1.5,
      pointRadius: closes.map((_, i) => (pivotColors[i] ? 4 : 0)),
      pointBackgroundColor: closes.map((_, i) => pivotColors[i] ?? '#c8c8d4'),
      fill: false,
      tension: 0.1,
    },
  ];

  if (resistLine) {
    const { p1, p2 } = resistLine;
    const lineData = Array(n).fill(null);
    for (let i = p1.idx; i < n; i++) {
      lineData[i] = lineAt(i, p1.idx, p1.price, p2.idx, p2.price);
    }
    datasets.push({
      label: 'Сопротивление',
      data: lineData,
      borderColor: '#ff5555',
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
      spanGaps: false,
    });
  }

  if (supportLine) {
    const { p1, p2 } = supportLine;
    const lineData = Array(n).fill(null);
    for (let i = p1.idx; i < n; i++) {
      lineData[i] = lineAt(i, p1.idx, p1.price, p2.idx, p2.price);
    }
    datasets.push({
      label: 'Поддержка',
      data: lineData,
      borderColor: '#44cc88',
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
      spanGaps: false,
    });
  }

  const qc = new QuickChart();
  qc.setConfig({
    type: 'line',
    data: { labels, datasets },
    options: {
      title: {
        display: true,
        text: `${coinSymbol}USDT · 15m · Тренд-пробой ${direction === 'up' ? '↑' : '↓'}`,
        fontColor: '#ffffff',
        fontSize: 13,
      },
      legend: {
        display: true,
        labels: { fontColor: '#aaaaaa', fontSize: 10 },
      },
      scales: {
        xAxes: [{ ticks: { display: false }, gridLines: { color: '#2c2c40', zeroLineColor: '#555' } }],
        yAxes: [{ ticks: { fontColor: '#aaaaaa', fontSize: 9 }, gridLines: { color: '#2c2c40', zeroLineColor: '#555' } }],
      },
    },
  });
  qc.setBackgroundColor('#1a1a2e');
  qc.setWidth(700);
  qc.setHeight(350);

  return await qc.toBinary();
};
