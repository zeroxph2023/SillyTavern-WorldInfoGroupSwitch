import { event_types, eventSource, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { executeSlashCommandsWithOptions } from '../../../slash-commands.js';
import { delay } from '../../../utils.js';
import { loadWorldInfo, onWorldInfoChange, saveWorldInfo, world_info, world_names } from '../../../world-info.js';

const SETTINGS_KEY = 'worldInfoGroupSwitch';

let isDiscord = null;
/**@type {HTMLElement}*/
let trigger;
let menu = false;

const settings = Object.assign({
    groups: {},
}, extension_settings[SETTINGS_KEY] ?? {});
extension_settings[SETTINGS_KEY] = settings;

// ── helpers ──
const getActiveBooks = () => [...(world_info.globalSelect ?? [])].filter(it => it);

const getUngroupedBooks = () => {
    if (!world_names?.length) return [];
    const grouped = new Set(Object.values(settings.groups).flat());
    return world_names.filter(n => !grouped.has(n));
};

const moveBook = (bookName, fromGroup, toGroup) => {
    if (fromGroup && fromGroup !== '__ungrouped__' && settings.groups[fromGroup]) {
        const idx = settings.groups[fromGroup].indexOf(bookName);
        if (idx >= 0) settings.groups[fromGroup].splice(idx, 1);
    }
    if (toGroup && toGroup !== '__ungrouped__') {
        if (!settings.groups[toGroup]) settings.groups[toGroup] = [];
        settings.groups[toGroup].push(bookName);
    }
    saveSettingsDebounced();
};

// ── Refresh display helpers (no full re-render) ──
const refreshMasterCheckboxes = (ctx) => {
    const active = getActiveBooks();
    for (const item of ctx.querySelectorAll('.stwigp--groupItem')) {
        const gn = item.getAttribute('data-group');
        if (!gn) continue;
        const books = gn === '__ungrouped__' ? getUngroupedBooks() : (settings.groups[gn] ?? []);
        const n = books.filter(b => active.includes(b)).length;
        const mc = item.querySelector('.stwigp--masterCb');
        if (mc) {
            mc.checked = books.length > 0 && n === books.length;
            mc.indeterminate = n > 0 && n < books.length;
        }
        const cs = item.querySelector('.stwigp--groupCount');
        if (cs) cs.textContent = `(${books.length})`;
    }
};

const refreshBookCheckboxes = (ctx) => {
    const active = getActiveBooks();
    for (const lbl of ctx.querySelectorAll('.stwigp--bookLabel')) {
        const nameDiv = lbl.querySelector('.stwis--ctxName');
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (nameDiv && cb) cb.checked = active.includes(nameDiv.textContent);
    }
};

const refreshDisplay = (ctx) => {
    refreshMasterCheckboxes(ctx);
    refreshBookCheckboxes(ctx);
    updateIcon();
};

// ── Render: original World Info Switch mode ──
const renderOriginalView = (ctx) => {
    const books = [...world_names];
    const active = getActiveBooks();
    const entries = {};
    books.forEach(it => { entries[it] = loadWorldInfo(it); });
    let book;

    const refreshOriginalCheckboxes = () => {
        const cur = getActiveBooks();
        for (const cb of ctx.querySelectorAll('.stwis--ctxItem input[type="checkbox"]')) {
            const char = cb.closest('[data-stwis--char]')?.getAttribute('data-stwis--char');
            if (char) cb.checked = cur.includes(char);
        }
    };

    const wrapper = document.createElement('div'); {
        wrapper.classList.add('stwis--wrapper');
        const rect = trigger.getBoundingClientRect();
        wrapper.style.setProperty('--stwis--y', `${rect.bottom}px`);
        wrapper.style.left = isDiscord ? 'var(--nav-bar-width)' : `${rect.left}px`;
        wrapper.addEventListener('click', (evt) => evt.stopPropagation());

        const list = document.createElement('ul'); {
            list.classList.add('stwis--ctxMenu', 'list-group');
            for (const c of books) {
                const item = document.createElement('li'); {
                    item.classList.add('stwis--ctxItem', 'list-group-item');
                    item.setAttribute('data-stwis--char', c);
                    item.addEventListener('pointerenter', async () => {
                        if (c != book) {
                            book = c;
                            elist.innerHTML = 'Loading...';
                            const data = await entries[c];
                            elist.innerHTML = '';
                            for (const e of Object.values(data.entries)) {
                                const ei = document.createElement('li'); {
                                    ei.classList.add('stwis--ctxItem', 'list-group-item');
                                    const lbl = document.createElement('label'); {
                                        lbl.addEventListener('click', (evt) => {
                                            evt.stopPropagation();
                                            e.disable = !lbl.querySelector('input').checked;
                                            saveWorldInfo(c, data);
                                        });
                                        const ecb = document.createElement('input'); {
                                            ecb.type = 'checkbox';
                                            ecb.checked = !e.disable;
                                            lbl.append(ecb);
                                        }
                                        const name = document.createElement('div'); {
                                            name.classList.add('stwis--ctxName');
                                            name.textContent = e.comment || e.key.join(', ');
                                            lbl.append(name);
                                        }
                                        ei.append(lbl);
                                    }
                                    elist.append(ei);
                                }
                            }
                        }
                    });
                    const lbl = document.createElement('label'); {
                        lbl.addEventListener('click', (evt) => {
                            evt.stopPropagation();
                            const cb = lbl.querySelector('input');
                            onWorldInfoChange({ state: cb.checked ? 'on' : 'off', silent: true }, c);
                            saveSettingsDebounced();
                            refreshOriginalCheckboxes();
                            refreshMasterCheckboxes(ctx);
                            updateIcon();
                        });
                        const cb = document.createElement('input'); {
                            cb.type = 'checkbox';
                            cb.checked = active.includes(c);
                            lbl.append(cb);
                        }
                        const name = document.createElement('div'); {
                            name.classList.add('stwis--ctxName');
                            name.textContent = c;
                            lbl.append(name);
                        }
                        item.append(lbl);
                    }
                    list.append(item);
                }
            }
            wrapper.append(list);
        }
        const elist = document.createElement('ul'); {
            elist.classList.add('stwis--ctxMenu', 'stwis--secondary', 'list-group');
            wrapper.append(elist);
        }
        ctx.append(wrapper);
    }
};

// ── Render: grouped mode ──
const renderGroupedView = (ctx) => {
    const active = getActiveBooks();
    const groupNames = Object.keys(settings.groups).sort((a, b) => a.localeCompare(b, 'zh'));

    const wrapper = document.createElement('div'); {
        wrapper.classList.add('stwis--wrapper');
        const rect = trigger.getBoundingClientRect();
        wrapper.style.setProperty('--stwis--y', `${rect.bottom}px`);
        wrapper.style.left = isDiscord ? 'var(--nav-bar-width)' : `${rect.left}px`;
        wrapper.addEventListener('click', (evt) => evt.stopPropagation());

        // ── Right panel (books, filled on hover) ──
        const rightPanel = document.createElement('ul'); {
            rightPanel.classList.add('stwis--ctxMenu', 'stwis--secondary', 'list-group');
        }

        // ── Left panel (groups) ──
        const leftPanel = document.createElement('ul'); {
            leftPanel.classList.add('stwis--ctxMenu', 'list-group');

            const rebuildRight = (groupName) => {
                rightPanel.innerHTML = '';
                const books = groupName === '__ungrouped__'
                    ? getUngroupedBooks()
                    : (settings.groups[groupName] ?? []);
                const currentNames = Object.keys(settings.groups).sort((a, b) => a.localeCompare(b, 'zh'));

                if (books.length === 0) {
                    const empty = document.createElement('li'); {
                        empty.classList.add('stwis--ctxItem', 'list-group-item');
                        const lbl = document.createElement('label'); {
                            lbl.style.justifyContent = 'center';
                            lbl.style.opacity = '0.4';
                            lbl.style.cursor = 'default';
                            lbl.textContent = '（空分组）';
                            empty.append(lbl);
                        }
                        rightPanel.append(empty);
                    }
                    return;
                }

                for (const bookName of books) {
                    const item = document.createElement('li'); {
                        item.classList.add('stwis--ctxItem', 'list-group-item', 'stwigp--bookItem');
                        const lbl = document.createElement('label'); {
                            lbl.classList.add('stwigp--bookLabel');
                            // checkbox
                            const cb = document.createElement('input'); {
                                cb.type = 'checkbox';
                                cb.checked = active.includes(bookName);
                                cb.addEventListener('click', (evt) => {
                                    evt.stopPropagation();
                                    onWorldInfoChange({ state: cb.checked ? 'on' : 'off', silent: true }, bookName);
                                    saveSettingsDebounced();
                                    refreshDisplay(ctx);
                                });
                                lbl.append(cb);
                            }
                            // book name
                            const name = document.createElement('div'); {
                                name.classList.add('stwis--ctxName');
                                name.textContent = bookName;
                                name.style.cursor = 'default';
                                lbl.append(name);
                            }
                            // move-to-group select
                            const sel = document.createElement('select'); {
                                sel.classList.add('stwigp--moveSelect');
                                const unOpt = document.createElement('option'); {
                                    unOpt.value = '__ungrouped__';
                                    unOpt.textContent = '未分组';
                                    if (groupName === '__ungrouped__') unOpt.selected = true;
                                    sel.append(unOpt);
                                }
                                for (const gn of currentNames) {
                                    const opt = document.createElement('option'); {
                                        opt.value = gn;
                                        opt.textContent = gn;
                                        if (gn === groupName) opt.selected = true;
                                        sel.append(opt);
                                    }
                                }
                                sel.addEventListener('change', () => {
                                    moveBook(bookName, groupName, sel.value);
                                    // Refresh book's displayed group inline
                                    lbl.setAttribute('data-group', sel.value);
                                    // Update group counts in left panel
                                    for (const gi of leftPanel.querySelectorAll('.stwigp--groupItem')) {
                                        const gn = gi.getAttribute('data-group');
                                        const cnt = gn === '__ungrouped__'
                                            ? getUngroupedBooks().length
                                            : (settings.groups[gn]?.length ?? 0);
                                        const cs = gi.querySelector('.stwigp--groupCount');
                                        if (cs) cs.textContent = cnt;
                                    }
                                    // Remove book from right panel (it no longer belongs to this group)
                                    item.remove();
                                    // If right panel now empty, show empty hint
                                    if (!rightPanel.querySelector('.stwigp--bookItem')) {
                                        rightPanel.innerHTML = '<li class="stwis--ctxItem list-group-item" style="color:#666; cursor:default;">该分组无世界书</li>';
                                    }
                                });
                                lbl.append(sel);
                            }
                            item.append(lbl);
                        }
                        rightPanel.append(item);
                    }
                }
            };

            // ── Management bar ──
            const mgmtItem = document.createElement('li'); {
                mgmtItem.classList.add('stwis--ctxItem', 'list-group-item', 'stwigp--mgmtItem');
                const bar = document.createElement('div'); {
                    bar.classList.add('stwigp--mgmtBar');
                    const input = document.createElement('input'); {
                        input.classList.add('text_pole');
                        input.placeholder = '新分组...';
                        input.addEventListener('keydown', (evt) => {
                            if (evt.key === 'Enter') {
                                const name = input.value.trim();
                                if (name && !settings.groups[name]) {
                                    settings.groups[name] = [];
                                    input.value = '';
                                    saveSettingsDebounced();
                                    ctx.innerHTML = '';
                                    renderGroupedView(ctx);
                                }
                            }
                        });
                        bar.append(input);
                    }
                    const addBtn = document.createElement('div'); {
                        addBtn.classList.add('menu_button', 'stwigp--addBtn');
                        addBtn.textContent = '+ 添加';
                        addBtn.addEventListener('click', (evt) => {
                            evt.stopPropagation();
                            const name = input.value.trim();
                            if (!name || settings.groups[name]) return;
                            settings.groups[name] = [];
                            input.value = '';
                            saveSettingsDebounced();
                            ctx.innerHTML = '';
                            renderGroupedView(ctx);
                        });
                        bar.append(addBtn);
                    }
                    mgmtItem.append(bar);
                }
                leftPanel.append(mgmtItem);
            }

            // ── Render a group entry ──
            const renderGroupItem = (groupName, booksList) => {
                const isUngrouped = groupName === '__ungrouped__';
                const displayName = isUngrouped ? '未分组' : groupName;
                const activeInGroup = booksList.filter(b => active.includes(b));
                const allOn = booksList.length > 0 && activeInGroup.length === booksList.length;
                const someOn = activeInGroup.length > 0 && activeInGroup.length < booksList.length;

                const item = document.createElement('li'); {
                    item.classList.add('stwis--ctxItem', 'list-group-item', 'stwigp--groupItem');
                    item.setAttribute('data-group', groupName);
                    item.addEventListener('pointerenter', () => rebuildRight(groupName));

                    const lbl = document.createElement('div'); {
                        lbl.classList.add('stwigp--groupLabel');
                        // master checkbox
                        const masterCb = document.createElement('input'); {
                            masterCb.type = 'checkbox';
                            masterCb.classList.add('stwigp--masterCb');
                            masterCb.checked = allOn;
                            masterCb.indeterminate = someOn;
                            masterCb.addEventListener('click', (evt) => {
                                evt.stopPropagation();
                                const state = masterCb.checked ? 'on' : 'off';
                                for (const b of booksList) {
                                    onWorldInfoChange({ state, silent: true }, b);
                                }
                                saveSettingsDebounced();
                                refreshDisplay(ctx);
                            });
                            lbl.append(masterCb);
                        }
                        // group name
                        const nameSpan = document.createElement('span'); {
                            nameSpan.classList.add('stwigp--groupName');
                            nameSpan.textContent = displayName;
                            if (!isUngrouped) {
                                nameSpan.title = '双击重命名';
                                nameSpan.addEventListener('dblclick', (evt) => {
                                    evt.stopPropagation();
                                    const newName = prompt('重命名分组:', groupName);
                                    if (!newName || newName === groupName) return;
                                    if (settings.groups[newName]) { alert(`分组 "${newName}" 已存在`); return; }
                                    settings.groups[newName] = settings.groups[groupName];
                                    delete settings.groups[groupName];
                                    saveSettingsDebounced();
                                    ctx.innerHTML = '';
                                    renderGroupedView(ctx);
                                });
                            }
                            lbl.append(nameSpan);
                        }
                        // book count
                        const countSpan = document.createElement('span'); {
                            countSpan.classList.add('stwigp--groupCount');
                            countSpan.textContent = `(${booksList.length})`;
                            lbl.append(countSpan);
                        }
                        // delete button (only for user groups)
                        if (!isUngrouped) {
                            const delBtn = document.createElement('i'); {
                                delBtn.classList.add('fa-solid', 'fa-trash-can', 'stwigp--delGroup');
                                delBtn.title = '删除分组';
                                delBtn.addEventListener('click', (evt) => {
                                    evt.stopPropagation();
                                    if (!confirm(`删除分组 "${groupName}"？`)) return;
                                    delete settings.groups[groupName];
                                    saveSettingsDebounced();
                                    ctx.innerHTML = '';
                                    renderGroupedView(ctx);
                                });
                                lbl.append(delBtn);
                            }
                        }
                        item.append(lbl);
                    }
                    leftPanel.append(item);
                }
            };

            // Render user groups + ungrouped
            for (const gn of groupNames) renderGroupItem(gn, settings.groups[gn] ?? []);
            renderGroupItem('__ungrouped__', getUngroupedBooks());
        }

        wrapper.append(leftPanel, rightPanel);
        ctx.append(wrapper);
    }
};

// ── Context menu listener ──
const contextListener = (evt) => {
    if (menu) return;
    menu = true;
    evt.preventDefault();

    const ctx = document.createElement('div'); {
        ctx.classList.add('stwis--ctxBlocker');
        ctx.addEventListener('click', (evt) => {
            evt.stopPropagation();
            ctx.remove();
            menu = false;
        });

        const choice = document.createElement('div'); {
            choice.classList.add('stwigp--choiceMenu');
            choice.style.left = `${evt.clientX}px`;
            choice.style.top = `${evt.clientY}px`;
            choice.addEventListener('click', (e) => e.stopPropagation());

            const origBtn = document.createElement('div'); {
                origBtn.classList.add('menu_button', 'stwigp--choiceItem');
                origBtn.innerHTML = '<i class="fa-solid fa-list"></i> 原模式';
                origBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    choice.remove();
                    renderOriginalView(ctx);
                });
                choice.append(origBtn);
            }
            const groupBtn = document.createElement('div'); {
                groupBtn.classList.add('menu_button', 'stwigp--choiceItem');
                groupBtn.innerHTML = '<i class="fa-solid fa-folder-tree"></i> 分组模式';
                groupBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    choice.remove();
                    renderGroupedView(ctx);
                });
                choice.append(groupBtn);
            }
            ctx.append(choice);
        }
        document.body.append(ctx);
    }
};

// ── Discord mode detection ──
const checkDiscord = () => {
    const newIsDiscord = getComputedStyle(document.body).getPropertyValue('--nav-bar-width') !== '';
    if (isDiscord != newIsDiscord) {
        isDiscord = newIsDiscord;
        document.body.classList[isDiscord ? 'add' : 'remove']('stwis--nonDiscord');
    }
    setTimeout(checkDiscord, 2000);
};

// ── Badge counter ──
const btn = /**@type {HTMLElement}*/(document.querySelector('#WI-SP-button > .drawer-toggle'));
const icon = /**@type {HTMLElement}*/(document.querySelector('#WIDrawerIcon'));
let count = -1;
let lastBooks = [];
const updateIcon = async () => {
    const newBooks = getActiveBooks();
    if (icon) icon.title = `World Info\n---\n${newBooks.join('\n')}`;
    if (!btn) return;
    if (count != newBooks.length) {
        if (newBooks.length == 0) {
            btn.classList.add('stwis--out');
            await delay(510);
            btn.setAttribute('data-stwis--count', newBooks.length.toString());
            btn.classList.remove('stwis--out');
        } else if (count == 0) {
            btn.classList.add('stwis--in');
            btn.setAttribute('data-stwis--count', newBooks.length.toString());
            await delay(510);
            btn.classList.remove('stwis--in');
        } else {
            btn.setAttribute('data-stwis--count', newBooks.length.toString());
            btn.classList.add('stwis--bounce');
            await delay(1010);
            btn.classList.remove('stwis--bounce');
        }
        count = newBooks.length;
    } else if (new Set(newBooks).difference(new Set(lastBooks)).size > 0) {
        btn.classList.add('stwis--bounce');
        await delay(1010);
        btn.classList.remove('stwis--bounce');
    }
    lastBooks = newBooks;
};

// ── Init ──
const init = () => {
    trigger = document.querySelector('#WI-SP-button > .drawer-toggle');
    if (!trigger) return;
    trigger.addEventListener('contextmenu', contextListener);
    checkDiscord();
    updateIcon();
    eventSource.on(event_types.SETTINGS_UPDATED, () => updateIcon());
};
init();
