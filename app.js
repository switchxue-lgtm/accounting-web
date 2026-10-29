(() => {
  const KEY = 'accounting_web_v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);

  const defaultCategories = () => [
    { id: 'c-food', name: '餐饮', type: 'expense', icon: '🍜' },
    { id: 'c-transport', name: '交通', type: 'expense', icon: '🚇' },
    { id: 'c-shop', name: '购物', type: 'expense', icon: '🛒' },
    { id: 'c-home', name: '居住', type: 'expense', icon: '🏠' },
    { id: 'c-fun', name: '娱乐', type: 'expense', icon: '🎮' },
    { id: 'c-other-e', name: '其他支出', type: 'expense', icon: '📦' },
    { id: 'c-salary', name: '工资', type: 'income', icon: '💰' },
    { id: 'c-bonus', name: '奖金', type: 'income', icon: '🎁' },
    { id: 'c-other-i', name: '其他收入', type: 'income', icon: '📥' },
  ];

  const defaultAccounts = () => [
    { id: 'a-cash', name: '现金', balance: 0, icon: '💵' },
    { id: 'a-wechat', name: '微信', balance: 0, icon: '💚' },
    { id: 'a-alipay', name: '支付宝', balance: 0, icon: '💙' },
    { id: 'a-bank', name: '银行卡', balance: 0, icon: '💳' },
  ];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        return {
          accounts: defaultAccounts(),
          categories: defaultCategories(),
          transactions: [],
          budgets: [],
        };
      }
      const data = JSON.parse(raw);
      data.accounts = data.accounts || defaultAccounts();
      data.categories = data.categories || defaultCategories();
      data.transactions = data.transactions || [];
      data.budgets = data.budgets || [];
      return data;
    } catch {
      return {
        accounts: defaultAccounts(),
        categories: defaultCategories(),
        transactions: [],
        budgets: [],
      };
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(store));
  }

  let store = load();
  let statsMode = 'month'; // month | salary
  let budgetMode = 'month';
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth() + 1;
  let viewSalaryIndex = 0; // index in salary periods list (0 = current)
  let editingTxId = null;

  const money = (n) => '¥' + (Number(n) || 0).toFixed(2);
  const pad = (n) => String(n).padStart(2, '0');

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function catById(id) {
    return store.categories.find((c) => c.id === id);
  }
  function accById(id) {
    return store.accounts.find((a) => a.id === id);
  }

  function isSalaryCat(c) {
    if (!c) return false;
    return c.name.includes('工资') || c.name.includes('薪资');
  }

  function monthRange(y, m) {
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 1, 0, 0, 0, 0);
    return { start, end };
  }

  function inRange(d, start, end) {
    const t = new Date(d).getTime();
    return t >= start.getTime() && t < end.getTime();
  }

  function sumType(type, start, end) {
    return store.transactions
      .filter((t) => t.type === type && inRange(t.date, start, end))
      .reduce((s, t) => s + t.amount, 0);
  }

  function totalAssets() {
    return store.accounts.reduce((s, a) => s + (a.balance || 0), 0);
  }

  /** 工资收入按时间升序 */
  function salaryTxs() {
    return store.transactions
      .filter((t) => t.type === 'income' && isSalaryCat(catById(t.categoryId)))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /** 发薪周期列表，新→旧。每项 {start, end, ongoing} */
  function salaryPeriods() {
    const list = salaryTxs();
    if (!list.length) return [];
    const now = new Date();
    const periods = [];
    for (let i = 0; i < list.length; i++) {
      const start = new Date(list[i].date);
      const ongoing = i === list.length - 1;
      const end = ongoing ? now : new Date(list[i + 1].date);
      periods.push({
        start,
        end,
        ongoing,
        salaryAmount: list[i].amount,
        id: list[i].id,
      });
    }
    return periods.reverse();
  }

  function currentSalaryPeriod() {
    const ps = salaryPeriods();
    return ps.find((p) => p.ongoing) || null;
  }

  function daysBetween(a, b) {
    const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((db - da) / 86400000);
  }

  function fmtDay(d) {
    const x = new Date(d);
    return `${x.getFullYear()}年${x.getMonth() + 1}月${x.getDate()}日`;
  }

  function toLocalInput(d = new Date()) {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
  }

  // ---------- render home ----------
  function renderHome() {
    const now = new Date();
    const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);
    const income = sumType('income', start, end);
    const expense = sumType('expense', start, end);
    $('#home-assets').textContent = money(totalAssets());
    $('#home-income').textContent = money(income);
    $('#home-expense').textContent = money(expense);
    $('#home-balance').textContent = money(income - expense);

    const sp = currentSalaryPeriod();
    if (!sp) {
      $('#salary-days').textContent = '未发薪';
      $('#salary-range').textContent = '录入分类为「工资」的收入后自动统计';
      $('#salary-expense').textContent = money(0);
      $('#salary-income').textContent = money(0);
      $('#salary-balance').textContent = money(0);
    } else {
      const days = daysBetween(sp.start, new Date());
      $('#salary-days').textContent = days === 0 ? '今天发薪' : `已过 ${days} 天`;
      $('#salary-range').textContent = `起点：${fmtDay(sp.start)}（进行中）`;
      const se = sumType('expense', sp.start, new Date(Date.now() + 1000));
      const si = sumType('income', sp.start, new Date(Date.now() + 1000));
      $('#salary-expense').textContent = money(se);
      $('#salary-income').textContent = money(si);
      $('#salary-balance').textContent = money(si - se);
    }

    const txs = [...store.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
    const groups = {};
    txs.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      (groups[key] || (groups[key] = [])).push(t);
    });
    const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    const box = $('#home-list');
    if (!keys.length) {
      box.innerHTML = '<div class="empty">暂无账单，点右下角 ＋ 开始记账</div>';
      return;
    }
    const today = new Date();
    const t0 = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const y0 = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;

    box.innerHTML = keys.map((k) => {
      const label = k === t0 ? '今天' : k === y0 ? '昨天' : k.slice(5).replace('-', '月') + '日';
      const items = groups[k].map((t) => txRow(t)).join('');
      return `<div class="day-group"><div class="day-label">${label}</div>${items}</div>`;
    }).join('');

    box.querySelectorAll('[data-id]').forEach((el) => {
      el.addEventListener('click', () => openTxDetail(el.dataset.id));
    });
  }

  function txRow(t) {
    const d = new Date(t.date);
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    let title, icon, cls, sign;
    if (t.type === 'transfer') {
      const from = accById(t.accountId)?.name || '账户';
      const to = accById(t.toAccountId)?.name || '账户';
      title = `${from} → ${to}`;
      if (t.note) title += ' · ' + t.note;
      icon = '🔄';
      cls = 'tf';
      sign = '';
    } else {
      const c = catById(t.categoryId);
      title = c?.name || '未知';
      if (t.note) title += ' · ' + t.note;
      icon = c?.icon || '📦';
      cls = t.type === 'expense' ? 'out' : 'in';
      sign = t.type === 'expense' ? '-' : '+';
    }
    return `<div class="tx-item" data-id="${t.id}">
      <div class="tx-icon">${icon}</div>
      <div class="tx-main"><div class="tx-title">${escapeHtml(title)}</div><div class="tx-sub">${time}</div></div>
      <div class="tx-amt ${cls}">${sign}${money(t.amount)}</div>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- stats ----------
  function renderStats() {
    $$('.seg-btn[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === statsMode));
    let income = 0, expense = 0, txs = [];
    if (statsMode === 'month') {
      const { start, end } = monthRange(viewYear, viewMonth);
      income = sumType('income', start, end);
      expense = sumType('expense', start, end);
      txs = store.transactions.filter((t) => inRange(t.date, start, end));
      $('#stats-title').textContent = `${viewYear}年${viewMonth}月`;
      const now = new Date();
      $('#stats-sub').textContent = (viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1) ? '本月' : '历史月份';
    } else {
      const periods = salaryPeriods();
      if (!periods.length) {
        $('#stats-title').textContent = '暂无工资记录';
        $('#stats-sub').textContent = '请先录入「工资」收入';
        income = expense = 0;
        txs = [];
      } else {
        viewSalaryIndex = Math.min(viewSalaryIndex, periods.length - 1);
        const p = periods[viewSalaryIndex];
        const end = p.ongoing ? new Date(Date.now() + 1000) : p.end;
        income = sumType('income', p.start, end);
        expense = sumType('expense', p.start, end);
        txs = store.transactions.filter((t) => inRange(t.date, p.start, end));
        const days = daysBetween(p.start, p.ongoing ? new Date() : p.end);
        $('#stats-title').textContent = p.ongoing
          ? `${fmtDay(p.start)} → 今天`
          : `${fmtDay(p.start)} → ${fmtDay(p.end)}`;
        $('#stats-sub').textContent = p.ongoing ? `进行中 · 已过 ${days} 天` : `共 ${days} 天`;
      }
    }
    $('#stats-income').textContent = money(income);
    $('#stats-expense').textContent = money(expense);
    $('#stats-balance').textContent = money(income - expense);

    const map = {};
    txs.filter((t) => t.type === 'expense').forEach((t) => {
      map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const box = $('#stats-cats');
    if (!entries.length) {
      box.innerHTML = '<div class="empty">暂无支出数据</div>';
      return;
    }
    box.innerHTML = entries.map(([cid, amt]) => {
      const c = catById(cid);
      const detail = txs.filter((t) => t.type === 'expense' && t.categoryId === cid)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .map((t) => {
          const d = new Date(t.date);
          return `<div class="list-row"><span>${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${t.note || '无备注'}</span><span class="indigo">-${money(t.amount)}</span></div>`;
        }).join('');
      return `<div class="cat-row">
        <div class="cat-head" data-expand>
          <span>${c?.icon || '📦'}</span>
          <span>${escapeHtml(c?.name || '未知')}</span>
          <span class="amt indigo">${money(amt)}</span>
        </div>
        <div class="cat-detail" hidden>${detail}</div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-expand]').forEach((h) => {
      h.addEventListener('click', () => {
        const d = h.parentElement.querySelector('.cat-detail');
        d.hidden = !d.hidden;
      });
    });
  }

  // ---------- budget ----------
  function renderBudget() {
    $$('[data-budget-mode]').forEach((b) => b.classList.toggle('active', b.dataset.budgetMode === budgetMode));
    const now = new Date();
    let used = 0;
    let budgets = [];
    if (budgetMode === 'month') {
      $('#budget-label').textContent = '本月总预算';
      $('#budget-hint').textContent = `自然月：${now.getFullYear()}年${now.getMonth() + 1}月（1日—月末）。与发薪周期预算互不影响。`;
      const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);
      used = sumType('expense', start, end);
      budgets = store.budgets.filter((b) => b.kind === 'month' && b.year === now.getFullYear() && b.month === now.getMonth() + 1);
    } else {
      $('#budget-label').textContent = '本发薪周期总预算';
      const sp = currentSalaryPeriod();
      if (!sp) {
        $('#budget-hint').textContent = '请先录入一笔分类为「工资」的收入。';
        budgets = [];
        used = 0;
      } else {
        $('#budget-hint').textContent = `发薪周期：${fmtDay(sp.start)} → 今天。与自然月预算互不影响。`;
        used = sumType('expense', sp.start, new Date(Date.now() + 1000));
        const key = sp.start.toISOString();
        budgets = store.budgets.filter((b) => b.kind === 'salary' && b.salaryStart === key);
      }
    }
    const total = budgets.find((b) => !b.categoryId);
    const totalAmt = total?.amount || 0;
    $('#budget-total').textContent = totalAmt > 0 ? money(totalAmt) : '未设置';
    const pct = totalAmt > 0 ? Math.min(used / totalAmt, 1.5) : 0;
    const bar = $('#budget-bar');
    bar.style.width = `${Math.min(pct, 1) * 100}%`;
    bar.classList.toggle('over', pct > 1);
    $('#budget-used').textContent = totalAmt > 0 ? `已用 ${money(used)} / ${money(totalAmt)}（${(pct * 100).toFixed(0)}%）` : '';

    const cats = budgets.filter((b) => b.categoryId);
    const list = $('#budget-list');
    if (!cats.length) {
      list.innerHTML = '<div class="empty">暂无分类预算，点右上角添加</div>';
      return;
    }
    list.innerHTML = cats.map((b) => {
      const c = catById(b.categoryId);
      let spent = 0;
      if (budgetMode === 'month') {
        const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);
        spent = store.transactions.filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && inRange(t.date, start, end)).reduce((s, t) => s + t.amount, 0);
      } else {
        const sp = currentSalaryPeriod();
        if (sp) {
          spent = store.transactions.filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && inRange(t.date, sp.start, new Date(Date.now() + 1000))).reduce((s, t) => s + t.amount, 0);
        }
      }
      const p = b.amount > 0 ? spent / b.amount : 0;
      return `<div class="card">
        <div class="row-between"><span>${c?.icon || ''} ${escapeHtml(c?.name || b.name)}</span>
        <button type="button" data-del-budget="${b.id}" style="border:none;background:none;color:#e53935;">删除</button></div>
        <div class="bar"><div class="bar-fill ${p > 1 ? 'over' : ''}" style="width:${Math.min(p, 1) * 100}%"></div></div>
        <div class="muted small">${money(spent)} / ${money(b.amount)}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-del-budget]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.budgets = store.budgets.filter((b) => b.id !== btn.dataset.delBudget);
        save();
        renderBudget();
        toast('已删除预算');
      });
    });
  }

  // ---------- mutations ----------
  function applyBalance(t, factor) {
    // factor +1 apply, -1 rollback
    if (t.type === 'transfer') {
      const from = accById(t.accountId);
      const to = accById(t.toAccountId);
      if (from) from.balance -= factor * t.amount;
      if (to) to.balance += factor * t.amount;
    } else if (t.type === 'expense') {
      const a = accById(t.accountId);
      if (a) a.balance -= factor * t.amount;
    } else if (t.type === 'income') {
      const a = accById(t.accountId);
      if (a) a.balance += factor * t.amount;
    }
  }

  function addTx(t) {
    store.transactions.push(t);
    applyBalance(t, 1);
    save();
  }

  function deleteTx(id) {
    const t = store.transactions.find((x) => x.id === id);
    if (!t) return;
    applyBalance(t, -1);
    store.transactions = store.transactions.filter((x) => x.id !== id);
    save();
  }

  // ---------- modals ----------
  function openModal(id) {
    $(id).hidden = false;
  }
  function closeModals() {
    $$('.modal').forEach((m) => { m.hidden = true; });
    editingTxId = null;
  }

  function fillSelects() {
    const exp = store.categories.filter((c) => c.type === 'expense');
    const inc = store.categories.filter((c) => c.type === 'income');
    const type = $$('#modal-tx .seg-btn.active')[0]?.dataset.txType || 'expense';
    const cats = type === 'expense' ? exp : inc;
    $('#tx-category').innerHTML = cats.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
    const accOpts = store.accounts.map((a) => `<option value="${a.id}">${a.icon} ${a.name}（${money(a.balance)}）</option>`).join('');
    $('#tx-account').innerHTML = accOpts;
    $('#tf-from').innerHTML = accOpts;
    $('#tf-to').innerHTML = accOpts;
  }

  function openAddTx() {
    editingTxId = null;
    $('#tx-modal-title').textContent = '记一笔';
    $$('#modal-tx .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.txType === 'expense'));
    fillSelects();
    $('#tx-amount').value = '';
    $('#tx-note').value = '';
    $('#tx-date').value = toLocalInput();
    openModal('#modal-tx');
  }

  function openTxDetail(id) {
    const t = store.transactions.find((x) => x.id === id);
    if (!t) return;
    const body = $('#generic-body');
    $('#generic-title').textContent = '账单详情';
    $('#generic-action').hidden = true;
    const d = new Date(t.date);
    let info = '';
    if (t.type === 'transfer') {
      info = `<p>${accById(t.accountId)?.name} → ${accById(t.toAccountId)?.name}</p>`;
    } else {
      info = `<p>${catById(t.categoryId)?.icon || ''} ${catById(t.categoryId)?.name || ''} · ${accById(t.accountId)?.name || ''}</p>`;
    }
    body.innerHTML = `
      ${info}
      <p style="font-size:24px;font-weight:700">${t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}${money(t.amount)}</p>
      <p class="muted">${fmtDay(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}</p>
      <p>${escapeHtml(t.note || '无备注')}</p>
      <button type="button" class="outline" id="detail-del" style="width:100%;margin-top:16px;color:#e53935;border-color:#fcc">删除账单</button>
    `;
    openModal('#modal-generic');
    $('#detail-del').onclick = () => {
      if (!confirm('删除后不可恢复，确定？')) return;
      deleteTx(id);
      closeModals();
      refresh();
      toast('已删除');
    };
  }

  // ---------- events ----------
  function switchPage(name) {
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + name));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === name));
    if (name === 'home') renderHome();
    if (name === 'stats') renderStats();
    if (name === 'budget') renderBudget();
  }

  function refresh() {
    const active = $('.page.active')?.id?.replace('page-', '') || 'home';
    switchPage(active);
  }

  $$('.tab').forEach((t) => t.addEventListener('click', () => switchPage(t.dataset.page)));

  $('#btn-add').onclick = openAddTx;
  $('#btn-transfer').onclick = () => {
    fillSelects();
    $('#tf-amount').value = '';
    $('#tf-note').value = '';
    $('#tf-date').value = toLocalInput();
    openModal('#modal-transfer');
  };

  $$('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));

  $$('#modal-tx .seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#modal-tx .seg-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      fillSelects();
    });
  });

  $('#tx-save').onclick = () => {
    const amount = parseFloat($('#tx-amount').value);
    if (!(amount > 0)) return toast('请输入有效金额');
    const type = $$('#modal-tx .seg-btn.active')[0].dataset.txType;
    const t = {
      id: uid(),
      amount,
      type,
      categoryId: $('#tx-category').value,
      accountId: $('#tx-account').value,
      date: new Date($('#tx-date').value).toISOString(),
      note: $('#tx-note').value.trim(),
    };
    addTx(t);
    closeModals();
    refresh();
    toast(`已记${type === 'expense' ? '支出' : '收入'} ${money(amount)}`);
  };

  $('#tf-save').onclick = () => {
    const amount = parseFloat($('#tf-amount').value);
    const from = $('#tf-from').value;
    const to = $('#tf-to').value;
    if (!(amount > 0)) return toast('请输入有效金额');
    if (from === to) return toast('转出和转入不能相同');
    const t = {
      id: uid(),
      amount,
      type: 'transfer',
      categoryId: '',
      accountId: from,
      toAccountId: to,
      date: new Date($('#tf-date').value).toISOString(),
      note: $('#tf-note').value.trim(),
    };
    addTx(t);
    closeModals();
    refresh();
    toast(`已转账 ${money(amount)}`);
  };

  $$('.seg-btn[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      statsMode = b.dataset.mode;
      viewSalaryIndex = 0;
      renderStats();
    });
  });
  $('#stats-prev').onclick = () => {
    if (statsMode === 'month') {
      viewMonth -= 1;
      if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; }
    } else {
      viewSalaryIndex = Math.min(viewSalaryIndex + 1, salaryPeriods().length - 1);
    }
    renderStats();
  };
  $('#stats-next').onclick = () => {
    if (statsMode === 'month') {
      const now = new Date();
      if (viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth >= now.getMonth() + 1)) return;
      viewMonth += 1;
      if (viewMonth > 12) { viewMonth = 1; viewYear += 1; }
    } else {
      viewSalaryIndex = Math.max(viewSalaryIndex - 1, 0);
    }
    renderStats();
  };

  $$('[data-budget-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      budgetMode = b.dataset.budgetMode;
      renderBudget();
    });
  });

  $('#btn-add-budget').onclick = () => {
    const body = $('#generic-body');
    $('#generic-title').textContent = '添加预算';
    $('#generic-action').hidden = true;
    const cats = store.categories.filter((c) => c.type === 'expense');
    body.innerHTML = `
      <label>类型
        <select id="bd-kind"><option value="total">总预算</option><option value="cat">分类预算</option></select>
      </label>
      <label id="bd-cat-wrap" hidden>分类
        <select id="bd-cat">${cats.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select>
      </label>
      <label>金额<input type="number" id="bd-amt" step="0.01" /></label>
      <button type="button" class="outline" id="bd-save" style="width:100%;margin-top:12px;background:#0277BD;color:#fff;border:none">保存</button>
    `;
    openModal('#modal-generic');
    $('#bd-kind').onchange = () => {
      $('#bd-cat-wrap').hidden = $('#bd-kind').value !== 'cat';
    };
    $('#bd-save').onclick = () => {
      const amount = parseFloat($('#bd-amt').value);
      if (!(amount > 0)) return toast('请输入金额');
      const now = new Date();
      const isCat = $('#bd-kind').value === 'cat';
      let salaryStart = '';
      if (budgetMode === 'salary') {
        const sp = currentSalaryPeriod();
        if (!sp) return toast('请先录入工资');
        salaryStart = sp.start.toISOString();
      }
      // remove existing same slot
      store.budgets = store.budgets.filter((b) => {
        if (budgetMode === 'month') {
          if (b.kind !== 'month' || b.year !== now.getFullYear() || b.month !== now.getMonth() + 1) return true;
          return isCat ? b.categoryId !== $('#bd-cat').value : !!b.categoryId;
        }
        if (b.kind !== 'salary' || b.salaryStart !== salaryStart) return true;
        return isCat ? b.categoryId !== $('#bd-cat').value : !!b.categoryId;
      });
      store.budgets.push({
        id: uid(),
        name: isCat ? '分类预算' : '总预算',
        amount,
        categoryId: isCat ? $('#bd-cat').value : null,
        kind: budgetMode,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        salaryStart,
      });
      save();
      closeModals();
      renderBudget();
      toast('预算已保存');
    };
  };

  function doExport() {
    const payload = {
      format: 'accounting_app_backup',
      version: '1.0-web',
      exportedAt: new Date().toISOString(),
      accounts: store.accounts,
      categories: store.categories,
      transactions: store.transactions,
      budgets: store.budgets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const name = `accounting_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`;
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已开始下载备份文件');
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.format && data.format !== 'accounting_app_backup') throw new Error('不是本应用备份');
        if (!confirm('导入将覆盖本机浏览器中的当前数据，确定？')) return;
        store.accounts = data.accounts || defaultAccounts();
        store.categories = data.categories || defaultCategories();
        store.transactions = data.transactions || [];
        store.budgets = data.budgets || [];
        save();
        refresh();
        toast(`导入完成：${store.transactions.length} 笔账单`);
      } catch (e) {
        toast('导入失败：' + e.message);
      }
    };
    reader.readAsText(file);
  }

  $('#btn-export').onclick = doExport;
  $('#menu-export').onclick = doExport;
  $('#btn-import').onclick = () => $('#file-import').click();
  $('#menu-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = (e) => {
    const f = e.target.files?.[0];
    if (f) doImport(f);
    e.target.value = '';
  };

  $('#menu-clear').onclick = () => {
    if (!confirm('确定清空全部数据？不可恢复')) return;
    store = {
      accounts: defaultAccounts(),
      categories: defaultCategories(),
      transactions: [],
      budgets: [],
    };
    save();
    refresh();
    toast('已清空');
  };

  $('#menu-accounts').onclick = () => {
    $('#generic-title').textContent = '账户管理';
    $('#generic-action').hidden = false;
    $('#generic-action').textContent = '添加';
    const render = () => {
      $('#generic-body').innerHTML = store.accounts.map((a) => `
        <div class="list-row">
          <div>${a.icon} ${escapeHtml(a.name)}<div class="muted small">${money(a.balance)}</div></div>
          <div>
            <button type="button" data-adj="${a.id}">调余额</button>
          </div>
        </div>`).join('') + '<p class="hint">余额随记账自动变化；调余额用于核对纠错。</p>';
      $$('[data-adj]').forEach((btn) => {
        btn.onclick = () => {
          const a = accById(btn.dataset.adj);
          const v = prompt('将「' + a.name + '」余额调整为', String(a.balance));
          if (v === null) return;
          const n = parseFloat(v);
          if (Number.isNaN(n)) return toast('无效数字');
          a.balance = n;
          save();
          render();
          refresh();
          toast('已调整');
        };
      });
    };
    render();
    openModal('#modal-generic');
    $('#generic-action').onclick = () => {
      const name = prompt('账户名称');
      if (!name) return;
      store.accounts.push({ id: uid(), name, balance: 0, icon: '💳' });
      save();
      render();
      toast('已添加账户');
    };
  };

  $('#menu-categories').onclick = () => {
    $('#generic-title').textContent = '分类管理';
    $('#generic-action').hidden = false;
    $('#generic-action').textContent = '添加';
    const render = () => {
      $('#generic-body').innerHTML = store.categories.map((c) => `
        <div class="list-row">
          <span>${c.icon} ${escapeHtml(c.name)} <span class="muted">${c.type === 'expense' ? '支出' : '收入'}</span></span>
        </div>`).join('');
    };
    render();
    openModal('#modal-generic');
    $('#generic-action').onclick = () => {
      const name = prompt('分类名称');
      if (!name) return;
      const type = confirm('是支出分类吗？\n确定=支出，取消=收入') ? 'expense' : 'income';
      store.categories.push({ id: uid(), name, type, icon: type === 'expense' ? '📦' : '📥' });
      save();
      render();
      toast('已添加分类');
    };
  };

  $('#btn-search').onclick = () => {
    const q = prompt('搜索备注 / 分类 / 金额');
    if (q === null || !q.trim()) return;
    const key = q.trim().toLowerCase();
    const hits = store.transactions.filter((t) => {
      const c = catById(t.categoryId)?.name || '';
      return (t.note || '').toLowerCase().includes(key) ||
        c.toLowerCase().includes(key) ||
        String(t.amount).includes(key);
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    $('#generic-title').textContent = `搜索：${q}`;
    $('#generic-action').hidden = true;
    $('#generic-body').innerHTML = hits.length
      ? hits.slice(0, 50).map((t) => txRow(t)).join('')
      : '<div class="empty">无结果</div>';
    openModal('#modal-generic');
    $('#generic-body').querySelectorAll('[data-id]').forEach((el) => {
      el.addEventListener('click', () => openTxDetail(el.dataset.id));
    });
  };

  // init
  renderHome();
})();
