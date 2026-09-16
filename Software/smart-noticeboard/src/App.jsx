import { useEffect, useState } from 'react';

export default function App() {
  const [notices, setNotices] = useState([]);
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch notices from the Flask backend
  useEffect(() => {
    const fetchNotices = async () => {
      try {
        const res = await fetch('/api/notices');
        const data = await res.json();
        setNotices(data);
      } catch (err) {
        console.error('Error fetching notices:', err);
      }
    };

    fetchNotices();
    const interval = setInterval(fetchNotices, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 flex flex-col justify-between">
      <header className="flex justify-between items-center border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-extrabold tracking-wide text-cyan-400">
          📌 SMART NOTICEBOARD !
        </h1>
        <div className="text-2xl font-mono text-slate-300">{time}</div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-6 my-auto py-6">
        {notices.length === 0 ? (
          <p className="text-slate-500 text-xl col-span-2 text-center">No active announcements.</p>
        ) : (
          notices.map((item, idx) => (
            <div key={idx} className="bg-slate-900 border-l-4 border-cyan-500 p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-bold text-slate-100 mb-2">{item.title}</h2>
              <p className="text-slate-300 text-lg">{item.content}</p>
            </div>
          ))
        )}
      </main>

      <footer className="text-sm text-slate-500 text-center border-t border-slate-800 pt-4">
        Raspberry Pi LAN Noticeboard
      </footer>
    </div>
  );
}