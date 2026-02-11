(function () {
  const charts = new Map();
  const lastModes = new Map();

  function brlCompact(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'R$ 0';
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 2
    });
  }

  function brl(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'R$ 0,00';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function buildDatasets(rows) {
    const map = new Map();
    for (const r of rows || []) {
      const key = r.op_date;
      const prev = map.get(key) || { profit: 0, cost: 0, result: 0 };
      prev.profit += Number(r.profit) || 0;
      prev.cost += Number(r.operational_cost) || 0;
      prev.result += Number(r.result) || 0;
      map.set(key, prev);
    }

    const labels = Array.from(map.keys()).sort();
    return {
      labels,
      profit: labels.map((d) => map.get(d).profit),
      cost: labels.map((d) => map.get(d).cost),
      result: labels.map((d) => map.get(d).result)
    };
  }

  function renderOperationsChart(rows, mode, canvasId) {
    const id = canvasId || 'opsChart';
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { labels, profit, cost, result } = buildDatasets(rows);

    const selectedMode = (mode || 'combo').trim();

    const key = id;
    const chart = charts.get(key) || null;
    const lastMode = lastModes.get(key) || '';

    if (chart && lastMode && lastMode !== selectedMode) {
      chart.destroy();
      charts.set(key, null);
    }
    lastModes.set(key, selectedMode);

    let datasets;
    let stacked = false;

    if (selectedMode === 'lines') {
      datasets = [
        {
          type: 'line',
          label: 'Lucro (R$)',
          data: profit,
          borderColor: 'rgba(16,185,129,1)',
          backgroundColor: 'rgba(16,185,129,0.12)',
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.28,
          fill: true
        },
        {
          type: 'line',
          label: 'Gastos (R$)',
          data: cost,
          borderColor: 'rgba(239,68,68,1)',
          backgroundColor: 'rgba(239,68,68,0.10)',
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.28,
          fill: true
        },
        {
          type: 'line',
          label: 'Resultado (R$)',
          data: result,
          borderColor: 'rgba(139,92,246,1)',
          backgroundColor: 'rgba(139,92,246,0.16)',
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.28,
          fill: true
        }
      ];
    } else if (selectedMode === 'stacked') {
      stacked = true;
      datasets = [
        {
          type: 'bar',
          label: 'Lucro (R$)',
          data: profit,
          backgroundColor: 'rgba(16,185,129,0.28)',
          borderColor: 'rgba(16,185,129,0.95)',
          borderWidth: 1,
          borderRadius: 10
        },
        {
          type: 'bar',
          label: 'Gastos (R$)',
          data: cost,
          backgroundColor: 'rgba(239,68,68,0.22)',
          borderColor: 'rgba(239,68,68,0.95)',
          borderWidth: 1,
          borderRadius: 10
        }
      ];
    } else {
      datasets = [
        {
          type: 'bar',
          label: 'Lucro (R$)',
          data: profit,
          backgroundColor: 'rgba(16,185,129,0.28)',
          borderColor: 'rgba(16,185,129,0.95)',
          borderWidth: 1,
          borderRadius: 10,
          barPercentage: 0.8,
          categoryPercentage: 0.7
        },
        {
          type: 'bar',
          label: 'Gastos (R$)',
          data: cost,
          backgroundColor: 'rgba(239,68,68,0.22)',
          borderColor: 'rgba(239,68,68,0.95)',
          borderWidth: 1,
          borderRadius: 10,
          barPercentage: 0.8,
          categoryPercentage: 0.7
        },
        {
          type: 'line',
          label: 'Resultado (R$)',
          data: result,
          borderColor: 'rgba(139,92,246,1)',
          backgroundColor: 'rgba(139,92,246,0.16)',
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.28,
          fill: true
        }
      ];
    }

    const data = { labels, datasets };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: 'rgba(255,255,255,0.82)', boxWidth: 16, boxHeight: 10 }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const v = context.parsed.y;
              return `${label}: ${brl(v)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: 'rgba(255,255,255,0.55)' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          stacked
        },
        y: {
          ticks: { color: 'rgba(255,255,255,0.55)', callback: (v) => brlCompact(v) },
          grid: { color: 'rgba(255,255,255,0.08)' },
          stacked
        }
      }
    };

    const existing = charts.get(key) || null;
    if (existing) {
      existing.data = data;
      existing.options = options;
      existing.update();
      return;
    }

    const created = new Chart(ctx, { data, options });
    charts.set(key, created);
  }

  window.OpedrinCharts = { renderOperationsChart };
})();
