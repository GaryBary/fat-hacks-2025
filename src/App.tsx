import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ==============================
// Fat Hacks 2025 – Gold Coast
// Single-file React app with optional **cloud sync** via Supabase.
// - Local mode (default): data in localStorage (per-browser)
// - Cloud mode (optional): share a URL and collaborate live via Supabase
// ==============================

// ---- helpers ----
const PEOPLE = ["Buzza", "Stork", "Marty", "Robbie", "Ronnie"] as const;
const DEFAULT_TASKS = [
  "Flights",
  "Accommodation",
  "Golf Games",
  "Car Hire",
  "Grocery",
  "Liquor",
  "Partay Supplies",
];

const STATUSES = ["Not Started", "In Progress", "Done"] as const;

type Person = string; // dynamic list (user can add new names)
type Status = typeof STATUSES[number];

type Task = {
  id: string;
  title: string; // can be blank
  category: string; // can be blank
  assignee: Person;
  status: Status;
  details?: string;
  sla?: string; // ISO datetime string
  reminderLeadMinutes?: number; // minutes before SLA to remind
  reminderSent?: boolean; // computed flag
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

type Settings = { kickoffISO?: string };

type CloudConfig = { url: string; key: string };

const ls = {
  read: <T,>(k: string, fallback: T): T => { try { const raw = localStorage.getItem(k); if (!raw) return fallback; return JSON.parse(raw) as T; } catch { return fallback; } },
  write: (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v)),
  remove: (k: string) => localStorage.removeItem(k),
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function useLocalStorage<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => ls.read<T>(key, initial));
  useEffect(() => { ls.write(key, val); }, [key, val]);
  return [val, setVal] as const;
}

function getTripSlug() { try { const u = new URL(location.href); return u.searchParams.get("trip") || "goldcoast-2025"; } catch { return "goldcoast-2025"; } }

// ---- tiny components ----
const Badge: React.FC<{ children: React.ReactNode; tone?: "ok"|"warn"|"bad"|"info" }>
  = ({ children, tone = "info" }) => {
  const map: Record<string, string> = {
    ok: "bg-emerald-500/20 text-emerald-100 border-emerald-400/40",
    warn: "bg-amber-500/20 text-amber-100 border-amber-400/40",
    bad: "bg-rose-600/20 text-rose-100 border-rose-400/40",
    info: "bg-cyan-500/20 text-cyan-100 border-cyan-400/40",
  };
  return (<span className={`px-2 py-0.5 rounded-full text-xs border ${map[tone]}`}>{children}</span>);
};

function cn(...classes: (string|false|undefined)[]) { return classes.filter(Boolean).join(" "); }

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => {
  const map: Record<string, string> = {
    app: "🏌️‍♂️", flights: "✈️", accom: "🏨", golf: "⛳", car: "🚗", grocery: "🛒", liquor: "🍻", party: "🎉",
    clock: "⏳", bell: "🔔", user: "👤", beach: "🏖️", wave: "🌊", cloud: "☁️", link: "🔗",
  };
  return <span className={className} aria-hidden>{map[name] ?? "⭐"}</span>;
};

// ---- simple modal ----
const Modal: React.FC<{ open: boolean; title: string; onClose: ()=>void; children: React.ReactNode; actions?: React.ReactNode }>
= ({ open, title, onClose, children, actions }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white text-gray-900 shadow-xl" onClick={e=>e.stopPropagation()}>
        <div className="px-4 py-3 border-b text-lg font-semibold">{title}</div>
        <div className="p-4 text-sm">{children}</div>
        <div className="px-4 pb-4 flex justify-end gap-2">{actions || (<button className="px-3 py-2 rounded-xl bg-gray-800 text-white" onClick={onClose}>Close</button>)}</div>
      </div>
    </div>
  );
};

// ---- countdown ----
const Countdown: React.FC<{ kickoffISO?: string; onChange: (iso?: string) => void; }>
= ({ kickoffISO, onChange }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const target = kickoffISO ? new Date(kickoffISO).getTime() : undefined;
  const diff = target ? Math.max(0, target - now) : undefined;
  const parts = useMemo(() => {
    if (diff === undefined) return null; const s = Math.floor(diff / 1000);
    const days = Math.floor(s / 86400); const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60); const seconds = s % 60; return { days, hours, minutes, seconds };
  }, [diff]);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white drop-shadow flex items-center gap-2"><Icon name="clock"/> Countdown to Kickoff</h2>
          <p className="text-white/80 text-sm">Set the date & time we tee off. The clock keeps us honest.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="datetime-local" className="bg-white/90 text-gray-900 rounded-xl px-3 py-2 shadow" value={kickoffISO ? toLocalDatetime(kickoffISO) : ""} onChange={(e)=>{ const v = e.target.value ? new Date(e.target.value) : undefined; onChange(v ? v.toISOString() : undefined); }} />
          <button className="px-3 py-2 rounded-xl bg-white/10 text-white border border-white/30 hover:bg-white/20" onClick={()=> onChange(undefined)} title="Clear">Reset</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {parts ? (
          [ { label: "Days", v: parts.days }, { label: "Hours", v: parts.hours }, { label: "Minutes", v: parts.minutes }, { label: "Seconds", v: parts.seconds }, ]
            .map(p => (
              <div key={p.label} className="backdrop-blur bg-white/10 border border-white/20 rounded-2xl p-4 text-center text-white shadow">
                <div className="text-4xl font-black drop-shadow">{String(p.v).padStart(2, "0")}</div>
                <div className="text-xs uppercase tracking-wider text-white/80">{p.label}</div>
              </div>
            ))
        ) : (<div className="col-span-4 text-white/90">No kickoff set. Add a date/time →</div>)}
      </div>
    </div>
  );
};

// ---- add / assign task form ----
const TaskForm: React.FC<{ onAdd: (t: Task) => void; people: string[]; onAddPerson: (name: string)=>void; }> = ({ onAdd, people, onAddPerson }) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState<Person>(people[0] || "");
  const [status, setStatus] = useState<Status>("Not Started");
  const [details, setDetails] = useState("");
  const [sla, setSla] = useState<string>("");
  const [lead, setLead] = useState<number|undefined>(60);
  function addNewAssignee(){ onAddPerson(""); }
  function submit(e: React.FormEvent){ e.preventDefault(); const now = new Date().toISOString(); const t: Task = { id: uid(), title, category, assignee, status, details: details || undefined, sla: sla ? new Date(sla).toISOString() : undefined, reminderLeadMinutes: lead === undefined || lead === null || Number.isNaN(lead as any) ? undefined : Number(lead), createdAt: now, updatedAt: now }; onAdd(t); setTitle(""); setCategory(""); setAssignee(people[0] || ""); setStatus("Not Started"); setDetails(""); setSla(""); setLead(60); }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="text-white/80 text-sm">Task Title</label><input className="w-full rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={title} onChange={e=>setTitle(e.target.value)} placeholder="(optional)"/></div>
        <div><label className="text-white/80 text-sm">Category</label><input list="categories" className="w-full rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={category} onChange={e=>setCategory(e.target.value)} placeholder="(optional) eg Flights"/><datalist id="categories">{DEFAULT_TASKS.map(c=>(<option key={c} value={c}/>))}</datalist></div>
        <div>
          <label className="text-white/80 text-sm flex items-center justify-between"><span>Assignee</span>
            <button type="button" onClick={addNewAssignee} className="text-xs px-2 py-1 rounded-lg bg-white/10 text-white border border-white/30">New</button>
          </label>
          <select className="w-full rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={assignee} onChange={(e)=>setAssignee(e.target.value)}>
            {people.map(p=> <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label className="text-white/80 text-sm">Status</label><select className="w-full rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={status} onChange={(e)=>setStatus(e.target.value as Status)}>{STATUSES.map(s=> <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="text-white/80 text-sm">SLA (Due)</label><input type="datetime-local" className="w-full rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={sla} onChange={(e)=>setSla(e.target.value)} /></div>
        <div><label className="text-white/80 text-sm">Reminder lead (mins)</label><input type="number" min={0} className="w-full rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={lead ?? ""} onChange={(e)=>setLead(e.target.value === "" ? undefined : Number(e.target.value))} /></div>
      </div>
      <div><label className="text-white/80 text-sm">Details / Notes</label><textarea className="w-full rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow h-20" value={details} onChange={(e)=>setDetails(e.target.value)} placeholder="(optional)"/></div>
      <div className="flex gap-2"><button className="px-4 py-2 rounded-xl bg-white text-gray-900 font-semibold shadow hover:shadow-lg">Add Task</button><button type="reset" onClick={()=>{setTitle(""); setCategory(""); setAssignee(people[0] || ""); setStatus("Not Started"); setDetails(""); setSla(""); setLead(60);}} className="px-4 py-2 rounded-xl bg-white/10 text-white border border-white/30">Clear</button></div>
    </form>
  );
};

// ---- category icon ----
const CategoryIcon: React.FC<{ category: string }> = ({ category }) => {
  const c = (category || "").toLowerCase();
  if (c.includes("flight")) return <Icon name="flights" className="text-lg"/>;
  if (c.includes("accom")) return <Icon name="accom" className="text-lg"/>;
  if (c.includes("golf")) return <Icon name="golf" className="text-lg"/>;
  if (c.includes("car")) return <Icon name="car" className="text-lg"/>;
  if (c.includes("grocery") || c.includes("shop")) return <Icon name="grocery" className="text-lg"/>;
  if (c.includes("liquor") || c.includes("drink")) return <Icon name="liquor" className="text-lg"/>;
  if (c.includes("party") || c.includes("partay")) return <Icon name="party" className="text-lg"/>;
  return <Icon name="beach" className="text-lg"/>;
};

// ---- task table ----
const TaskTable: React.FC<{ tasks: Task[]; onUpdate: (t: Task) => void; onDelete: (id: string) => void; assignees: string[]; onAddPerson: (name: string) => void; }>
= ({ tasks, onUpdate, onDelete, assignees, onAddPerson }) => {
  const [q, setQ] = useState(""); const [assignee, setAssignee] = useState<string>("All"); const [status, setStatus] = useState<string>("All"); const [sort, setSort] = useState<string>("due");
  const filtered = useMemo(()=>{ let list = tasks; if (assignee !== "All") list = list.filter(t=>t.assignee===assignee); if (status !== "All") list = list.filter(t=>t.status===status); if (q.trim()) { const s = q.toLowerCase(); list = list.filter(t=> [t.title,t.category,t.assignee,t.status,t.details].filter(Boolean).join(" ").toLowerCase().includes(s)); } if (sort === "due") { list = [...list].sort((a,b)=> (a.sla?new Date(a.sla).getTime():Infinity) - (b.sla?new Date(b.sla).getTime():Infinity)); } else if (sort === "updated") { list = [...list].sort((a,b)=> new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); } return list; }, [tasks, q, assignee, status, sort]);
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input className="flex-1 min-w-[200px] rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" placeholder="Search tasks" value={q} onChange={e=>setQ(e.target.value)} />
        <select className="rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={assignee} onChange={(e)=>setAssignee(e.target.value)}>
          <option>All</option>
          {assignees.map(p=> <option key={p}>{p}</option>)}
        </select>
        <select className="rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={status} onChange={(e)=>setStatus(e.target.value)}>
          <option>All</option>
          {STATUSES.map(s=> <option key={s}>{s}</option>)}
        </select>
        <select className="rounded-xl px-3 py-2 bg-white/90 text-gray-900 shadow" value={sort} onChange={(e)=>setSort(e.target.value)}>
          <option value="due">Sort by due</option>
          <option value="updated">Sort by updated</option>
        </select>
        <button type="button" onClick={()=> onAddPerson("")} className="rounded-xl px-3 py-2 bg-white/10 text-white border border-white/30">Add assignee</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="text-left text-white/80"><tr><th className="p-3">Task</th><th className="p-3">Category</th><th className="p-3">Assignee</th><th className="p-3">Status</th><th className="p-3">SLA</th><th className="p-3">Reminder</th><th className="p-3 text-right">Actions</th></tr></thead>
          <tbody className="text-white/95">
            {filtered.map(t=> { const { overdue, dueSoon, soonMins } = dueState(t); return (
              <tr key={t.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="p-3 font-semibold flex items-center gap-2">
                  <CategoryIcon category={t.category} />
                  <input className="ml-2 rounded-lg px-2 py-1 bg-white/80 text-gray-900 w-[160px]" value={t.title || ""} onChange={(e)=>onUpdate({ ...t, title: e.target.value, updatedAt: new Date().toISOString() })} placeholder="(no title)" />
                </td>
                <td className="p-3"><input list="categories" className="rounded-lg px-2 py-1 bg-white/80 text-gray-900 w-[120px]" value={t.category || ""} onChange={(e)=>onUpdate({ ...t, category: e.target.value, updatedAt: new Date().toISOString() })} placeholder="(blank)" /></td>
                <td className="p-3"><select className="rounded-lg px-2 py-1 bg-white/80 text-gray-900" value={t.assignee} onChange={(e)=>onUpdate({ ...t, assignee: e.target.value as Person, updatedAt: new Date().toISOString() })}>{assignees.map(p=> <option key={p}>{p}</option>)}</select></td>
                <td className="p-3"><select className="rounded-lg px-2 py-1 bg-white/80 text-gray-900" value={t.status} onChange={(e)=>onUpdate({...t, status: e.target.value as Status, updatedAt: new Date().toISOString()})}>{STATUSES.map(s=> <option key={s}>{s}</option>)}</select></td>
                <td className="p-3"><div className="flex items-center gap-2"><input type="datetime-local" className="rounded-lg px-2 py-1 bg-white/80 text-gray-900" value={t.sla ? toLocalDatetime(t.sla) : ""} onChange={(e)=>onUpdate({ ...t, sla: e.target.value ? new Date(e.target.value).toISOString() : undefined, updatedAt: new Date().toISOString(), reminderSent:false })} placeholder="(none)" />{t.sla && (<>{overdue && <Badge tone="bad">Overdue</Badge>}{!overdue && dueSoon && <Badge tone="warn">Due in {soonMins}m</Badge>}{!overdue && !dueSoon && <Badge tone="ok">On track</Badge>}</>)}</div></td>
                <td className="p-3"><input type="number" min={0} className="rounded-lg px-2 py-1 bg-white/80 text-gray-900 w-20" value={t.reminderLeadMinutes ?? ""} onChange={(e)=>onUpdate({ ...t, reminderLeadMinutes: e.target.value === "" ? undefined : Number(e.target.value), updatedAt: new Date().toISOString(), reminderSent:false })} placeholder="—" /></td>
                <td className="p-3 text-right whitespace-nowrap"><button className="px-3 py-1 rounded-lg bg-rose-600/80 text-white" onClick={()=>onDelete(t.id)}>Delete</button></td>
              </tr>
            )})}
            {filtered.length === 0 && (<tr><td colSpan={7} className="p-4 text-center text-white/70">No tasks found. Add some or adjust filters.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---- reminder engine ----
const Reminders: React.FC<{ tasks: Task[]; onFlag: (id: string) => void }> = ({ tasks, onFlag }) => {
  const audioRef = useRef<HTMLAudioElement|null>(null);
  useEffect(() => { if ("Notification" in window) { if (Notification.permission === "default") { Notification.requestPermission().catch(()=>{}); } } }, []);
  useEffect(() => {
    const tick = () => { const now = Date.now(); tasks.forEach(t => { if (!t.sla || t.status === "Done") return; const lead = (t.reminderLeadMinutes ?? 0) * 60 * 1000; const fireAt = new Date(t.sla).getTime() - lead; if (now >= fireAt && !t.reminderSent) { const title = `Reminder: ${t.title || "(no title)"}`; const body = `${t.assignee} • due ${formatDateTime(t.sla)} (${t.reminderLeadMinutes || 0}m lead)`; if ("Notification" in window && Notification.permission === "granted") { try { new Notification(title, { body }); } catch {} } try { navigator.vibrate?.(200); } catch {} try { audioRef.current?.play().catch(()=>{}); } catch {} onFlag(t.id); } }); };
    const iv = setInterval(tick, 30 * 1000); tick(); return () => clearInterval(iv);
  }, [tasks, onFlag]);
  return (<audio ref={audioRef} src={BEEP} preload="auto" />);
};

const BEEP = "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA/////////////////////////////////////////////8AAAAD//uQxAAGAAAAABJAAAADwACAAACcQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// ---- utils ----
function formatDateTime(iso: string) { try { const d = new Date(iso); return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; } }
function toLocalDatetime(iso: string) { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, "0"); const yyyy = d.getFullYear(); const mm = pad(d.getMonth()+1); const dd = pad(d.getDate()); const hh = pad(d.getHours()); const mi = pad(d.getMinutes()); return `${yyyy}-${mm}-${dd}T${hh}:${mi}`; }
function dueState(t: Task) { if (!t.sla) return { overdue: false, dueSoon: false, soonMins: 0 }; const due = new Date(t.sla).getTime(); const now = Date.now(); const overdue = now > due && t.status !== "Done"; const delta = Math.max(0, due - now); const soonMins = Math.floor(delta / 60000); return { overdue, dueSoon: !overdue && soonMins <= 240, soonMins }; }
function makeSeedTasks(): Task[] { const now = new Date(); const plusDays = (d: number) => new Date(now.getTime() + d*24*3600*1000).toISOString(); const roll = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random()*arr.length)]; const items = DEFAULT_TASKS.map((cat, i) => ({ id: uid(), title: cat, category: cat, assignee: roll(PEOPLE), status: i % 3 === 0 ? "Done" : i % 3 === 1 ? "In Progress" : "Not Started", details: i===2?"Book 2x rounds • 8am tee times • 4 players":"", sla: plusDays(i+1), reminderLeadMinutes: 60, reminderSent: false, createdAt: now.toISOString(), updatedAt: now.toISOString(), } as Task)); return items; }

// ---- runtime smoke tests ----
function runSmokeTests(){ try { console.groupCollapsed('Fat Hacks smoke tests'); const ds = dueState({ id:'1', title:'t', category:'', assignee: 'Buzza', status:'Not Started', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }); console.assert(ds.overdue === false && ds.dueSoon === false, 'dueState no SLA'); const seeds = makeSeedTasks(); console.assert(Array.isArray(seeds) && seeds.length === DEFAULT_TASKS.length, 'seed task count'); const iso = new Date().toISOString(); const local = toLocalDatetime(iso); console.assert(typeof local === 'string' && local.includes('T'), 'toLocalDatetime format'); console.groupEnd(); } catch (e) { console.warn('Smoke tests failed', e); } }
if (typeof window !== 'undefined') setTimeout(runSmokeTests, 0);

// ---- dashboard ----
const Dashboard: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const total = tasks.length; const done = tasks.filter(t=>t.status==="Done").length; const inprog = tasks.filter(t=>t.status==="In Progress").length; const notStarted = tasks.filter(t=>t.status==="Not Started").length; const overdue = tasks.filter(t=> dueState(t).overdue).length; const soon = tasks.filter(t=> !dueState(t).overdue && dueState(t).dueSoon).length;
  const byAssignee = Array.from(new Set(tasks.map(t=>t.assignee))).map(name => ({ name, total: tasks.filter(t=>t.assignee===name).length, done: tasks.filter(t=>t.assignee===name && t.status==="Done").length, }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard label="Total" value={total} tone="info" />
        <StatCard label="Done" value={done} tone="ok" />
        <StatCard label="In Progress" value={inprog} tone="info" />
        <StatCard label="Not Started" value={notStarted} tone="info" />
        <StatCard label="Overdue" value={overdue} tone="bad" />
        <StatCard label="Due Soon" value={soon} tone="warn" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 border border-white/20 bg-white/10 backdrop-blur text-white"><h4 className="font-semibold mb-3">Overall Progress</h4><ProgressBar value={total? Math.round((done/total)*100) : 0} /><div className="text-xs text-white/80 mt-1">{done}/{total} complete</div></div>
        <div className="rounded-2xl p-4 border border-white/20 bg-white/10 backdrop-blur text-white"><h4 className="font-semibold mb-3">By Assignee</h4><div className="space-y-2">{byAssignee.map(a=> (<div key={a.name} className="flex items-center gap-3"><div className="w-20 text-sm">{a.name}</div><div className="flex-1"><ProgressBar value={a.total? Math.round((a.done/a.total)*100) : 0} /></div><div className="w-16 text-right text-xs">{a.done}/{a.total}</div></div>))}</div></div>
      </div>
      <div className="rounded-2xl p-4 border border-white/20 bg-white/10 backdrop-blur text-white"><h4 className="font-semibold mb-2">Upcoming SLAs (next 72h)</h4><div className="flex flex-col gap-2 max-h-56 overflow-auto pr-1">{tasks.filter(t=> t.sla && new Date(t.sla).getTime() > Date.now()).filter(t=> new Date(t.sla!).getTime() - Date.now() < 72*3600*1000).sort((a,b)=> new Date(a.sla!).getTime() - new Date(b.sla!).getTime()).map(t=> (<div key={t.id} className="flex items-center justify-between bg-white/10 border border-white/20 rounded-xl px-3 py-2"><div className="flex items-center gap-2"><CategoryIcon category={t.category} /><span className="font-semibold">{t.title || "(no title)"}</span><span className="text-white/70 text-xs">({t.assignee})</span></div><div className="text-sm">{formatDateTime(t.sla!)} <span className="text-white/60">•</span> <span className="text-white/80">remind {t.reminderLeadMinutes||0}m prior</span></div></div>))}{tasks.filter(t=> t.sla && new Date(t.sla).getTime() > Date.now() && (new Date(t.sla).getTime() - Date.now()) < 72*3600*1000).length === 0 && (<div className="text-white/70 text-sm">Nothing due in the next 72 hours.</div>)}</div></div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; tone: "ok"|"warn"|"bad"|"info" }>
  = ({ label, value, tone }) => (
  <div className={cn("rounded-2xl p-4 border backdrop-blur text-white", tone === "ok" && "bg-emerald-600/20 border-emerald-400/30", tone === "warn" && "bg-amber-600/20 border-amber-400/30", tone === "bad" && "bg-rose-700/20 border-rose-400/30", tone === "info" && "bg-cyan-700/20 border-cyan-400/30") }>
    <div className="text-white/80 text-xs">{label}</div>
    <div className="text-2xl font-black">{value}</div>
  </div>
);
const ProgressBar: React.FC<{ value: number }> = ({ value }) => (<div className="h-3 w-full bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>);

// ---- Cloud adapter (Supabase) ----
function getEnvSupabase(): CloudConfig | null {
  try {
    const g: any = (globalThis as any);
    const href = location.href;
    const search = new URL(href).searchParams;
    const hashStr = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
    const hash = new URLSearchParams(hashStr);

    let url = (g.SUPABASE_URL as string) || search.get('sb_url') || hash.get('sb_url') || ls.read<string|undefined>('fh25.supabase.url', undefined);
    let key = (g.SUPABASE_ANON_KEY as string) || search.get('sb_key') || hash.get('sb_key') || ls.read<string|undefined>('fh25.supabase.key', undefined);

    // also support packed base64 JSON in ?sb= or #sb=
    const packed = search.get('sb') || hash.get('sb');
    if ((!url || !key) && packed) {
      try {
        const decoded = JSON.parse(atob(decodeURIComponent(packed)));
        url = decoded.url || url; key = decoded.key || key;
      } catch {}
    }

    if (url && key) return { url, key };
  } catch {}
  return null;
}

function useSupabase(tripSlug: string) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const env = getEnvSupabase();
    if (env) {
      const c = createClient(env.url, env.key, { auth: { persistSession: false } });
      setClient(c);
    }
  }, []);
  useEffect(() => {
    const run = async () => {
      if (!client) return;
      try {
        await client.from('trips').upsert({ slug: tripSlug }).select();
        setConnected(true);
      } catch (e: any) {
        setError(String(e.message || e));
        setConnected(false);
      }
    };
    run();
  }, [client, tripSlug]);
  async function setKickoffISO(iso?: string) {
    if (!client) return;
    try { await client.from('trips').upsert({ slug: tripSlug, kickoff_iso: iso ?? null }).select(); } catch {}
  }
  return { client, connected, error, setKickoffISO };
}

async function fetchCloudTasks(client: SupabaseClient, tripSlug: string): Promise<Task[]> { const { data, error } = await client.from('tasks').select('*').eq('trip_slug', tripSlug).order('created_at', { ascending: false }); if (error) throw error; return (data || []).map(dbToTask); }
function dbToTask(r: any): Task { return { id: r.id, title: r.title ?? "", category: r.category ?? "", assignee: (r.assignee ?? PEOPLE[0]) as Person, status: (r.status ?? 'Not Started') as Status, details: r.details ?? undefined, sla: r.sla ?? undefined, reminderLeadMinutes: r.reminder_lead_minutes ?? undefined, reminderSent: r.reminder_sent ?? false, createdAt: r.created_at ?? new Date().toISOString(), updatedAt: r.updated_at ?? new Date().toISOString(), }; }
function taskToDb(t: Task, tripSlug: string): any { return { id: t.id, trip_slug: tripSlug, title: t.title || null, category: t.category || null, assignee: t.assignee, status: t.status, details: t.details || null, sla: t.sla || null, reminder_lead_minutes: t.reminderLeadMinutes ?? null, reminder_sent: t.reminderSent ?? false, created_at: t.createdAt, updated_at: t.updatedAt }; }

// ---- main app ----
export default function App() {
  const tripSlug = getTripSlug();
  // Local fallback
  const [tasksLocal, setTasksLocal] = useLocalStorage<Task[]>(`fh25.tasks.${tripSlug}`, makeSeedTasks());
  const [settingsLocal, setSettingsLocal] = useLocalStorage<Settings>(`fh25.settings.${tripSlug}`, { kickoffISO: undefined });
  // Cloud
  const { client, connected, error, setKickoffISO } = useSupabase(tripSlug);
  const [tasks, setTasks] = useState<Task[]>(tasksLocal);
  const [settings, setSettings] = useState<Settings>(settingsLocal);
  // Assignees (dynamic)
  const [people, setPeople] = useLocalStorage<string[]>(`fh25.people.${tripSlug}`, Array.from(PEOPLE));
  const allAssignees = useMemo(()=> Array.from(new Set([...(people||[]), ...tasks.map(t=>t.assignee).filter(Boolean)])), [people, tasks]);

  // UI modal state
  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newAssignee, setNewAssignee] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [connUrl, setConnUrl] = useState("");
  const [connKey, setConnKey] = useState("");
  const [showReset, setShowReset] = useState(false);

  // Load from cloud if available
  useEffect(() => { (async () => { if (client && connected) { try { const cloudTasks = await fetchCloudTasks(client, tripSlug); setTasks(cloudTasks); try { const { data } = await client.from('trips').select('kickoff_iso').eq('slug', tripSlug).maybeSingle(); setSettings(s => ({ ...s, kickoffISO: (data as any)?.kickoff_iso ?? s.kickoffISO })); } catch {} } catch {} } })(); }, [client, connected, tripSlug]);

  // Realtime subscription
  useEffect(() => { if (!client || !connected) return; const channel = client.channel(`tasks:${tripSlug}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `trip_slug=eq.${tripSlug}` }, (payload) => { if (payload.eventType === 'INSERT' && payload.new) { setTasks(prev => { const exists = prev.some(x => x.id === (payload.new as any).id); return exists ? prev : [dbToTask(payload.new), ...prev]; }); } else if (payload.eventType === 'UPDATE' && payload.new) { setTasks(prev => prev.map(t => t.id === (payload.new as any).id ? dbToTask(payload.new) : t)); } else if (payload.eventType === 'DELETE' && payload.old) { setTasks(prev => prev.filter(t => t.id !== (payload.old as any).id)); } }).subscribe(); return () => { try { client.removeChannel(channel); } catch {} }; }, [client, connected, tripSlug]);

  // Persist to local when not connected (or as cache)
  useEffect(() => { setTasksLocal(tasks); }, [tasks]);
  useEffect(() => { setSettingsLocal(settings); }, [settings]);

  // CRUD wrappers (cloud if available)
  const updateTask = async (next: Task) => { setTasks(prev => prev.map(t=> t.id===next.id? next : t)); if (client && connected) { await client.from('tasks').upsert(taskToDb(next, tripSlug)).select(); } };
  const addTask = async (t: Task) => { setTasks(prev => [t, ...prev]); if (client && connected) { await client.from('tasks').insert(taskToDb(t, tripSlug)).select(); } };
  const deleteTask = async (id: string) => { setTasks(prev => prev.filter(t=> t.id!==id)); if (client && connected) { await client.from('tasks').delete().eq('id', id).eq('trip_slug', tripSlug); } };

  const overdueCount = tasks.filter(t=> dueState(t).overdue).length;

  // ===== Share link (snapshot only; JSON buttons removed) =====
  function encodeState(data: any){ try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))); } catch { return btoa(JSON.stringify(data)); } }
  function decodeState(s: string){ try { return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch { return JSON.parse(atob(s)); } }
  const openShare = () => { const snap = { tasks, settings }; const url = `${location.origin}${location.pathname}?trip=${tripSlug}#state=${encodeState(snap)}`; setShareUrl(url); setShowShare(true); };
  useEffect(()=>{ if (location.hash.startsWith('#state=')){ const stateStr = location.hash.slice('#state='.length); try { const obj = decodeState(stateStr); if (confirm('Import shared state from link? This will replace your current data.')){ if (obj.tasks && Array.isArray(obj.tasks)) setTasks(obj.tasks); if (obj.settings) setSettings(obj.settings); } } catch { alert('Bad share link'); } try { history.replaceState(null, '', location.pathname + location.search); } catch {} } },[]);

  // Cloud connection UI (store creds in localStorage for quick demos)
  function connectCloudPrompt(){ setConnUrl(ls.read('fh25.supabase.url','')); setConnKey(ls.read('fh25.supabase.key','')); setShowConnect(true); }
  function disconnectCloud(){ ls.remove('fh25.supabase.url'); ls.remove('fh25.supabase.key'); alert('Cloud disconnected. Reloading.'); location.reload(); }

  const clearAll = () => { setShowReset(true); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-700 via-indigo-700 to-fuchsia-700 relative">
      {/* stylised hero waves */}
      <div className="absolute inset-0 -z-10 opacity-40 pointer-events-none select-none">
        <svg className="absolute bottom-[-10%] left-0 w-[140%]" viewBox="0 0 1440 320" preserveAspectRatio="none"><path fill="#00ffff" fillOpacity="0.25" d="M0,160L60,165.3C120,171,240,181,360,170.7C480,160,600,128,720,112C840,96,960,96,1080,117.3C1200,139,1320,181,1380,202.7L1440,224L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"/></svg>
        <svg className="absolute bottom-[-6%] left-0 w-[140%]" viewBox="0 0 1440 320" preserveAspectRatio="none"><path fill="#ffd700" fillOpacity="0.18" d="M0,96L60,112C120,128,240,160,360,192C480,224,600,256,720,245.3C840,235,960,181,1080,149.3C1200,117,1320,107,1380,101.3L1440,96L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"/></svg>
      </div>

      <header className="px-6 pt-6 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">⛳</div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-black text-white drop-shadow flex items-center gap-2">Fat Hacks 2025 – Gold Coast <span className="text-2xl">🏖️🌴</span></h1>
              <div className="text-white/80 text-sm -mt-1">Golf trip planner • Queensland beach-party vibe</div>
              <div className="text-xs mt-1 text-white/70 flex items-center gap-2"><Icon name="link"/> Trip: <span className="font-mono bg-white/10 rounded px-2 py-0.5">{tripSlug}</span>{connected ? <span className="ml-2"><Badge tone="ok"><Icon name="cloud"/> Cloud connected</Badge></span> : <span className="ml-2"><Badge tone="warn">Local mode</Badge></span>}{error && <span className="text-rose-200">{String(error)}</span>}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openShare} className="px-3 py-2 rounded-xl bg-white/10 text-white border border-white/30">Share link</button>
            <button onClick={()=> setShowAdd(true)} className="px-3 py-2 rounded-xl bg-white/10 text-white border border-white/30">Add assignee</button>
            {!connected && <button onClick={connectCloudPrompt} className="px-3 py-2 rounded-xl bg-white/10 text-white border border-white/30">Connect cloud</button>}
            {connected && <button onClick={disconnectCloud} className="px-3 py-2 rounded-xl bg-white/10 text-white border border-white/30">Disconnect</button>}
            {!connected && <button onClick={clearAll} className="px-3 py-2 rounded-xl bg-white/10 text-white border border-white/30">Reset demo data</button>}
          </div>
        </div>
      </header>

      <main className="px-6 pb-16 max-w-7xl mx-auto space-y-6">
        <div className="rounded-3xl p-5 border border-white/20 bg-white/10 backdrop-blur text-white shadow-lg">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1"><Countdown kickoffISO={settings.kickoffISO} onChange={async (iso)=> { setSettings({ ...settings, kickoffISO: iso }); if (connected && client) await setKickoffISO(iso); }} /></div>
            <div className="w-full lg:w-80 flex flex-col gap-3">
              <div className={cn("rounded-2xl border p-4", overdueCount>0 ? "border-rose-400/30 bg-rose-600/20" : "border-emerald-400/30 bg-emerald-600/20") }>
                <div className="text-sm text-white/80">SLA Health</div>
                <div className="text-2xl font-black">{overdueCount>0? `${overdueCount} overdue` : "All on track"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-3xl p-5 border border-white/20 bg-white/10 backdrop-blur text-white shadow-lg">
            <h3 className="text-xl font-bold mb-3 flex items-center gap-2"><Icon name="party"/> Add / Assign Task</h3>
            <TaskForm onAdd={addTask as any} people={allAssignees} onAddPerson={() => { setShowAdd(true); }} />
          </div>
          <div className="rounded-3xl p-5 border border-white/20 bg-white/10 backdrop-blur text-white shadow-lg lg:col-span-2">
            <h3 className="text-xl font-bold mb-3 flex items-center gap-2"><Icon name="golf"/> Task Tracker</h3>
            <TaskTable tasks={tasks} onUpdate={updateTask as any} onDelete={deleteTask as any} assignees={allAssignees} onAddPerson={() => { setShowAdd(true); }} />
          </div>
        </div>

        <div className="rounded-3xl p-5 border border-white/20 bg-white/10 backdrop-blur text-white shadow-lg">
          <h3 className="text-xl font-bold mb-3 flex items-center gap-2"><Icon name="wave"/> Dashboard</h3>
          <Dashboard tasks={tasks} />
        </div>
      
        {/* Modals */}
        <Modal open={showShare} title="Share link" onClose={()=> setShowShare(false)}>
          <div className="space-y-2">
            <p>Send this URL to the crew. It restores your current snapshot locally.</p>
            <input className="w-full rounded-lg border px-3 py-2" readOnly value={shareUrl} onFocus={(e)=> e.currentTarget.select()} />
            <div className="flex justify-end gap-2 mt-2">
              <button className="px-3 py-2 rounded-lg bg-gray-200" onClick={()=> setShowShare(false)}>Close</button>
              <button className="px-3 py-2 rounded-lg bg-gray-900 text-white" onClick={async ()=>{ try { await navigator.clipboard.writeText(shareUrl); } catch {} }}>Copy</button>
            </div>
          </div>
        </Modal>

        <Modal open={showAdd} title="Add assignee" onClose={()=> setShowAdd(false)}>
          <div className="space-y-2">
            <input autoFocus className="w-full rounded-lg border px-3 py-2" placeholder="Name" value={newAssignee} onChange={e=> setNewAssignee(e.target.value)} />
            <div className="flex justify-end gap-2 mt-2">
              <button className="px-3 py-2 rounded-lg bg-gray-200" onClick={()=> setShowAdd(false)}>Cancel</button>
              <button className="px-3 py-2 rounded-lg bg-gray-900 text-white" onClick={()=>{ const n = newAssignee.trim(); if(n){ if(!(people||[]).includes(n)) setPeople([...(people||[]), n]); setNewAssignee(""); setShowAdd(false); } }}>Add</button>
            </div>
          </div>
        </Modal>

        <Modal open={showConnect} title="Connect cloud (Supabase)" onClose={()=> setShowConnect(false)}>
          <div className="space-y-2">
            <label className="text-sm">Supabase URL</label>
            <input className="w-full rounded-lg border px-3 py-2" placeholder="https://YOUR_PROJECT.supabase.co" value={connUrl} onChange={e=> setConnUrl(e.target.value)} />
            <label className="text-sm">Anon key</label>
            <textarea className="w-full rounded-lg border px-3 py-2" rows={3} placeholder="ey..." value={connKey} onChange={e=> setConnKey(e.target.value)} />
            <div className="flex justify-end gap-2 mt-2">
              <button className="px-3 py-2 rounded-lg bg-gray-200" onClick={()=> setShowConnect(false)}>Cancel</button>
              <button className="px-3 py-2 rounded-lg bg-gray-900 text-white" onClick={()=>{ if(!connUrl || !connKey) return; ls.write('fh25.supabase.url', connUrl); ls.write('fh25.supabase.key', connKey); location.reload(); }}>Connect</button>
            </div>
          </div>
        </Modal>

        <Modal open={showReset} title="Reset demo data" onClose={()=> setShowReset(false)}>
          <div className="space-y-2">
            <p>This will replace your current local data with fresh demo tasks. Continue?</p>
            <div className="flex justify-end gap-2 mt-2">
              <button className="px-3 py-2 rounded-lg bg-gray-200" onClick={()=> setShowReset(false)}>Cancel</button>
              <button className="px-3 py-2 rounded-lg bg-rose-600 text-white" onClick={()=>{ setTasks(makeSeedTasks()); setShowReset(false); }}>Reset</button>
            </div>
          </div>
        </Modal>
      </main>

      <Reminders tasks={tasks} onFlag={async (id)=> { setTasks(prev=> prev.map(t=> t.id===id? { ...t, reminderSent: true, updatedAt: new Date().toISOString() } : t)); if (client && connected) { const t = tasks.find(x=>x.id===id); if (t) await (client.from('tasks').upsert(taskToDb({ ...t, reminderSent: true, updatedAt: new Date().toISOString() }, tripSlug)).select()); } }} />

      <footer className="px-6 pb-8 pt-4 text-center text-white/70 text-xs">Built with love for the Fat Hacks Community</footer>
    </div>
  );
}
