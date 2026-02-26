import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db, ensureAnonymousAuth, firebaseConfigError } from './firebase';

function getWeekKey(date = new Date()) {
  const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tempDate.getUTCDay() || 7;
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  return `${tempDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function createAiSummary({ teamName, weekKey, updates }) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing VITE_GEMINI_API_KEY in .env file.');
  }

  const prompt = `You are a project manager assistant. Summarize these weekly updates for team ${teamName} in concise bullet points with:\n1) Wins\n2) Risks\n3) Next week focus\n\nWeek: ${weekKey}\n\nUpdates:\n${updates
    .map((item) => `- ${item.memberName}: ${item.update}`)
    .join('\n')}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI request failed: ${message}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No summary returned.';
}

export default function App() {
  const [teamName, setTeamName] = useState('');
  const [activeTeam, setActiveTeam] = useState(null);
  const [weekKey, setWeekKey] = useState(getWeekKey());
  const [memberName, setMemberName] = useState('');
  const [update, setUpdate] = useState('');
  const [entries, setEntries] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (firebaseConfigError) {
      setError(firebaseConfigError);
      return undefined;
    }

    ensureAnonymousAuth().catch((authError) => {
      setError(authError.message);
    });

    return undefined;
  }, []);

  useEffect(() => {
    if (!db || !activeTeam) {
      return undefined;
    }

    const updatesQuery = query(
      collection(db, 'teams', activeTeam.id, 'weeklyInputs'),
      orderBy('createdAt', 'desc'),
    );

    const summaryQuery = query(
      collection(db, 'teams', activeTeam.id, 'summaries'),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribeUpdates = onSnapshot(updatesQuery, (snapshot) => {
      setEntries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeSummaries = onSnapshot(summaryQuery, (snapshot) => {
      setSummaries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeUpdates();
      unsubscribeSummaries();
    };
  }, [activeTeam]);

  const weekEntries = useMemo(
    () => entries.filter((item) => item.weekKey === weekKey),
    [entries, weekKey],
  );

  async function handleCreateTeam(event) {
    event.preventDefault();
    setError('');
    if (!teamName.trim()) {
      setError('Team name is required.');
      return;
    }

    if (!db) {
      setError(firebaseConfigError || 'Firebase is not configured.');
      return;
    }

    const teamRef = await addDoc(collection(db, 'teams'), {
      name: teamName.trim(),
      createdAt: serverTimestamp(),
    });

    setActiveTeam({ id: teamRef.id, name: teamName.trim() });
    setTeamName('');
  }

  async function handleAddEntry(event) {
    event.preventDefault();
    setError('');
    if (!activeTeam) {
      setError('Create a team first.');
      return;
    }

    if (!db) {
      setError(firebaseConfigError || 'Firebase is not configured.');
      return;
    }

    if (!memberName.trim() || !update.trim()) {
      setError('Member name and update are required.');
      return;
    }

    await addDoc(collection(db, 'teams', activeTeam.id, 'weeklyInputs'), {
      memberName: memberName.trim(),
      update: update.trim(),
      weekKey,
      createdAt: serverTimestamp(),
    });

    setUpdate('');
  }

  async function handleGenerateSummary() {
    setError('');
    if (!activeTeam) {
      setError('Create a team first.');
      return;
    }

    if (!db) {
      setError(firebaseConfigError || 'Firebase is not configured.');
      return;
    }

    if (weekEntries.length === 0) {
      setError('Add at least one weekly update before generating summary.');
      return;
    }

    setLoadingAi(true);
    try {
      const summaryText = await createAiSummary({
        teamName: activeTeam.name,
        weekKey,
        updates: weekEntries,
      });

      await addDoc(collection(db, 'teams', activeTeam.id, 'summaries'), {
        weekKey,
        content: summaryText,
        createdAt: serverTimestamp(),
      });
    } catch (aiError) {
      setError(aiError.message);
    } finally {
      setLoadingAi(false);
    }
  }

  return (
    <main className="app">
      <h1>Weekly Team Activity Tracker</h1>
      <p className="subhead">Create a team, collect weekly updates, and generate an AI summary.</p>

      <section className="panel">
        <h2>1) Team Setup</h2>
        <form onSubmit={handleCreateTeam} className="row">
          <input
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="Team name (e.g. Product Squad)"
          />
          <button type="submit">Create Team</button>
        </form>
        {activeTeam ? <p className="success">Active team: {activeTeam.name}</p> : null}
      </section>

      <section className="panel">
        <h2>2) Weekly Inputs</h2>
        <form onSubmit={handleAddEntry} className="column">
          <label>
            Week
            <input value={weekKey} onChange={(event) => setWeekKey(event.target.value)} />
          </label>
          <label>
            Team member
            <input
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="Name"
            />
          </label>
          <label>
            Update
            <textarea
              value={update}
              onChange={(event) => setUpdate(event.target.value)}
              placeholder="What did you finish? Any blockers?"
            />
          </label>
          <button type="submit">Save Weekly Input</button>
        </form>

        <h3>This week entries ({weekEntries.length})</h3>
        <ul>
          {weekEntries.map((item) => (
            <li key={item.id}>
              <strong>{item.memberName}</strong>: {item.update}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>3) AI Summary</h2>
        <button onClick={handleGenerateSummary} disabled={loadingAi}>
          {loadingAi ? 'Generating...' : 'Generate Weekly Summary'}
        </button>
        <ul>
          {summaries.map((summary) => (
            <li key={summary.id}>
              <h4>{summary.weekKey}</h4>
              <pre>{summary.content}</pre>
            </li>
          ))}
        </ul>
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
