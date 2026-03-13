import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { summarizeYouTubeVideo } from "./services/geminiService";
import {
  YouTubeIcon,
  LoaderIcon,
  SparklesIcon,
  CopyIcon,
  CheckIcon,
  LinkIcon,
  GlobeIcon,
  CpuChipIcon,
  HistoryIcon,
  TrashIcon,
} from "./components/icons";
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
  where,
} from "./services/firebase";
import type { User } from "firebase/auth";

// --- Types ---
interface UsageStats {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface HistoryItem {
  id: string;
  url: string;
  title: string;
  summary: string;
  usage: UsageStats | null;
  model: string;
  language: string;
  timestamp: number;
}

// --- Components ---

interface UrlInputProps {
  url: string;
  setUrl: (url: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const UrlInput: React.FC<UrlInputProps> = ({
  url,
  setUrl,
  onSubmit,
  isLoading,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      onSubmit();
    }
  };

  return (
    <div className="relative group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
      <div className="relative flex items-center bg-slate-900 rounded-xl border border-slate-700 shadow-xl overflow-hidden">
        <div className="pl-4 text-red-500">
          <YouTubeIcon className="h-6 w-6" />
        </div>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste YouTube URL here..."
          disabled={isLoading}
          className="w-full px-4 py-4 bg-transparent text-white placeholder-slate-400 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={onSubmit}
          disabled={isLoading || !url.trim()}
          className="mr-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
        >
          {isLoading ? (
            <LoaderIcon className="animate-spin h-5 w-5" />
          ) : (
            <SparklesIcon className="h-5 w-5" />
          )}
          <span className="hidden sm:inline">
            {isLoading ? "Working..." : "Summarize"}
          </span>
        </button>
      </div>
    </div>
  );
};

// --- Custom Markdown Rendering ---

const MarkdownComponents: any = {
  h1: ({ node, ...props }: any) => (
    <h1
      className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-blue-300 to-indigo-300 mb-8 mt-4 pb-4 border-b border-slate-800/80 tracking-tight"
      {...props}
    />
  ),
  h2: ({ node, ...props }: any) => (
    <h2
      className="text-2xl sm:text-3xl font-bold text-slate-100 mb-4 mt-10 flex items-center tracking-tight"
      {...props}
    />
  ),
  h3: ({ node, ...props }: any) => (
    <h3
      className="text-xl sm:text-2xl font-semibold text-indigo-300 mb-3 mt-8"
      {...props}
    />
  ),
  p: ({ node, ...props }: any) => (
    <p
      className="text-slate-300 leading-8 mb-6 text-lg font-light"
      {...props}
    />
  ),
  strong: ({ node, ...props }: any) => (
    <strong
      className="font-bold text-white bg-slate-800/80 px-1.5 py-0.5 rounded mx-0.5 box-decoration-clone border border-slate-700/50"
      {...props}
    />
  ),
  blockquote: ({ node, ...props }: any) => (
    <blockquote
      className="relative pl-6 py-4 my-8 border-l-4 border-indigo-500/50 bg-slate-900/30 rounded-r-xl text-slate-400 italic shadow-inner"
      {...props}
    />
  ),
  hr: ({ node, ...props }: any) => (
    <hr className="border-slate-800 my-10" {...props} />
  ),
  a: ({ node, ...props }: any) => (
    <a
      className="text-sky-400 hover:text-sky-300 underline decoration-sky-400/30 hover:decoration-sky-300 transition-all underline-offset-4 font-medium"
      {...props}
    />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="space-y-3 mb-8 list-none ml-1" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol
      className="list-decimal list-inside space-y-3 mb-8 text-slate-300 ml-2"
      {...props}
    />
  ),
  li: ({ node, ...props }: any) => {
    const isOrdered = node.parent?.tagName === "ol";
    if (isOrdered) {
      return (
        <li
          className="text-slate-300 leading-relaxed text-lg pl-2 marker:text-indigo-400 marker:font-semibold"
          {...props}
        />
      );
    }
    return (
      <li
        className="flex items-start text-slate-300 leading-relaxed text-lg"
        {...props}
      >
        <span className="mr-3 mt-2.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
        <span className="flex-1">{props.children}</span>
      </li>
    );
  },
  pre: ({ children }: any) => <>{children}</>,
  code: ({ node, className, children, ...props }: any) => {
    const isBlock = node?.parent?.tagName === "pre";
    if (!isBlock) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-200 font-mono text-sm border border-slate-700"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <div className="overflow-hidden my-6 rounded-xl border border-slate-800 bg-slate-950/80 shadow-lg">
        <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 border-b border-slate-800">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
        <div className="overflow-x-auto p-4">
          <code
            className="block text-slate-300 font-mono text-sm leading-relaxed"
            {...props}
          >
            {children}
          </code>
        </div>
      </div>
    );
  },
  table: ({ node, ...props }: any) => (
    <div className="overflow-x-auto my-8 rounded-lg border border-slate-800 shadow-md">
      <table
        className="min-w-full divide-y divide-slate-800 bg-slate-900/50"
        {...props}
      />
    </div>
  ),
  thead: ({ node, ...props }: any) => (
    <thead className="bg-slate-900/80" {...props} />
  ),
  th: ({ node, ...props }: any) => (
    <th
      className="px-6 py-3 text-left text-xs font-semibold text-indigo-300 uppercase tracking-wider"
      {...props}
    />
  ),
  tbody: ({ node, ...props }: any) => (
    <tbody className="divide-y divide-slate-800" {...props} />
  ),
  tr: ({ node, ...props }: any) => (
    <tr className="hover:bg-slate-800/30 transition-colors" {...props} />
  ),
  td: ({ node, ...props }: any) => (
    <td
      className="px-6 py-4 whitespace-nowrap text-sm text-slate-300"
      {...props}
    />
  ),
};

interface SummaryDisplayProps {
  summary: string;
  usage: UsageStats | null;
  isLoading: boolean;
  loadingStatus: string | null;
  onPublish: () => void;
  isViewingShared: boolean;
  model: string;
}

const SummaryDisplay: React.FC<SummaryDisplayProps> = ({
  summary,
  usage,
  isLoading,
  loadingStatus,
  onPublish,
  isViewingShared,
  model,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    if (summary) {
      navigator.clipboard
        .writeText(summary)
        .then(() => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2500);
        })
        .catch((err) => console.error("Failed to copy", err));
    }
  };

  const calculateCost = () => {
    if (!usage) return 0;
    
    let inputRate = 0;
    let outputRate = 0;

    if (model === "gemini-3.1-pro-preview") {
      if (usage.totalTokenCount > 200000) {
        inputRate = 4.0 / 1_000_000;
        outputRate = 18.0 / 1_000_000;
      } else {
        inputRate = 2.0 / 1_000_000;
        outputRate = 12.0 / 1_000_000;
      }
    } else if (model === "gemini-3.1-flash-lite-preview") {
      inputRate = 0.25 / 1_000_000;
      outputRate = 1.50 / 1_000_000;
    } else {
      // gemini-3-flash-preview
      inputRate = 0.50 / 1_000_000;
      outputRate = 3.00 / 1_000_000;
    }

    return (
      usage.promptTokenCount * inputRate +
      usage.candidatesTokenCount * outputRate
    );
  };

  if (isLoading && !summary) {
    return (
      <div className="mt-12 flex flex-col items-center justify-center text-slate-400 animate-pulse">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
          <LoaderIcon className="relative h-12 w-12 text-blue-400 animate-spin" />
        </div>
        <h3 className="mt-6 text-xl font-medium text-slate-200">
          Analyzing Video Content
        </h3>
        <p className="mt-2 text-slate-500 max-w-xs text-center">
          {loadingStatus ||
            `Generating a comprehensive summary using ${
              model === "gemini-3.1-pro-preview"
                ? "Gemini 3.1 Pro"
                : model === "gemini-3.1-flash-lite-preview"
                ? "Gemini 3.1 Flash Lite"
                : "Gemini 3 Flash"
            }...`}
        </p>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div
      id="summary-result"
      className="mt-12 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full"
    >
      {/* Show transient status even if summary has started streaming */}
      {isLoading && loadingStatus && (
        <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-sm flex items-center gap-3 animate-pulse">
          <LoaderIcon className="h-4 w-4 animate-spin" />
          <span>{loadingStatus}</span>
        </div>
      )}

      <div className="relative rounded-2xl bg-slate-900/60 backdrop-blur-md border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div
              className={`h-2 w-2 rounded-full ${isViewingShared ? "bg-purple-500" : "bg-green-500"} shadow-[0_0_10px_rgba(34,197,94,0.5)]`}
            ></div>
            <span className="text-sm font-medium text-slate-300">
              {isViewingShared ? "Shared Summary" : "Generated Summary"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isViewingShared && (
              <button
                onClick={onPublish}
                className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                title="Share Summary"
              >
                <LinkIcon className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-2 text-slate-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
              title="Copy to Clipboard"
            >
              {isCopied ? (
                <CheckIcon className="h-5 w-5" />
              ) : (
                <CopyIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 sm:p-12 pb-6">
          <ReactMarkdown
            components={MarkdownComponents}
            remarkPlugins={[remarkGfm]}
          >
            {summary}
          </ReactMarkdown>
        </div>

        {/* Usage Footer */}
        {usage && (
          <div className="px-8 py-4 bg-slate-950/40 border-t border-slate-800/50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                  Input Tokens
                </span>
                <span className="text-sm font-mono text-indigo-300">
                  {usage.promptTokenCount.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                  Output Tokens
                </span>
                <span className="text-sm font-mono text-cyan-300">
                  {usage.candidatesTokenCount.toLocaleString()}
                </span>
              </div>
              <div className="hidden sm:flex flex-col border-l border-slate-800 pl-6">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                  Total Tokens
                </span>
                <span className="text-sm font-mono text-slate-300">
                  {usage.totalTokenCount.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Estimated Operation Cost
              </span>
              <span className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 font-mono">
                ${calculateCost().toFixed(4)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface SettingsSelectProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  icon: React.ReactNode;
  disabled: boolean;
}

const SettingsSelect: React.FC<SettingsSelectProps> = ({
  label,
  value,
  onChange,
  options,
  icon,
  disabled,
}) => (
  <div className="space-y-2">
    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
      {label}
    </label>
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-400 transition-colors">
        {icon}
      </div>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full pl-10 pr-10 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:outline-none transition-all appearance-none disabled:opacity-50 cursor-pointer hover:bg-slate-800"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-slate-900">
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-600">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          ></path>
        </svg>
      </div>
    </div>
  </div>
);

const PublishModal: React.FC<{ url: string; onClose: () => void }> = ({
  url,
  onClose,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
      inputRef.current?.select();
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/30">
          <h3 className="text-lg font-semibold text-white">Share Summary</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-slate-400 text-sm">
            Share this link to let others view this summary.
          </p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              readOnly
              value={url}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-300 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {isCopied ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                <CopyIcon className="w-4 h-4" />
              )}
              {isCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const App: React.FC = () => {
  const [url, setUrl] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [isViewingShared, setIsViewingShared] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("Italian");
  const [model, setModel] = useState<string>("gemini-3-flash-preview");
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load history on mount or auth change
  useEffect(() => {
    if (user) {
      const loadHistory = async () => {
        try {
          const q = query(
            collection(db, "users", user.uid, "history"),
            orderBy("timestamp", "desc"),
          );
          const querySnapshot = await getDocs(q);
          const historyData: HistoryItem[] = [];
          querySnapshot.forEach((doc) => {
            historyData.push({ id: doc.id, ...doc.data() } as HistoryItem);
          });
          setHistory(historyData);
        } catch (e) {
          console.error("Failed to load history from Firestore", e);
        }
      };
      loadHistory();
    } else {
      const stored = localStorage.getItem("summary_history");
      if (stored) {
        try {
          setHistory(JSON.parse(stored));
        } catch (e) {
          console.error("Failed to load history", e);
        }
      } else {
        setHistory([]);
      }
    }
  }, [user]);

  // Save history when it changes (only for local storage if not logged in)
  useEffect(() => {
    if (!user) {
      localStorage.setItem("summary_history", JSON.stringify(history));
    }
  }, [history, user]);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash.startsWith("#/view/")) {
        try {
          const encodedData = window.location.hash.substring(7);
          const b64ToUtf8 = (str: string) =>
            decodeURIComponent(
              atob(str)
                .split("")
                .map(
                  (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2),
                )
                .join(""),
            );
          const decodedSummary = b64ToUtf8(decodeURIComponent(encodedData));
          setSummary(decodedSummary);
          setUsage(null);
          setLoadingStatus(null);
          setIsViewingShared(true);
          setUrl("");
          setError(null);
        } catch (e) {
          setError("The shared link is invalid.");
          setIsViewingShared(false);
        }
      } else {
        setIsViewingShared(false);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleSummarize = useCallback(async () => {
    if (!url.trim()) return;

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    setIsLoading(true);
    setLoadingStatus(null);
    setSummary("");
    setUsage(null);
    setError(null);
    setPublishedUrl(null);

    if (isViewingShared) {
      window.history.pushState(
        "",
        document.title,
        window.location.pathname + window.location.search,
      );
      setIsViewingShared(false);
    }

    let fullSummary = "";
    let finalUsage: UsageStats | null = null;

    try {
      const stream = summarizeYouTubeVideo(url, language, model);
      for await (const chunk of stream) {
        if (chunk.status) {
          setLoadingStatus(chunk.status);
          continue;
        }

        // Clear status once we start receiving content
        if (chunk.text && loadingStatus) {
          setLoadingStatus(null);
        }

        fullSummary += chunk.text;
        setSummary((prev) => prev + chunk.text);
        if (chunk.usage) {
          finalUsage = chunk.usage;
          setUsage(chunk.usage);
        }
      }

      // Extract title from summary (first heading)
      const titleMatch = fullSummary.match(/^#+\s*(.*)/m);
      const historyTitle = titleMatch
        ? titleMatch[1].trim()
        : `Summary of ${url.substring(0, 30)}...`;

      // Save to history
      const existingItem = history.find((item) => item.url === url);

      const newItem: HistoryItem = {
        id: existingItem ? existingItem.id : crypto.randomUUID(),
        url,
        title: historyTitle,
        summary: fullSummary,
        usage: finalUsage,
        model,
        language,
        timestamp: Date.now(),
      };

      if (user) {
        try {
          if (existingItem) {
            await deleteDoc(doc(db, "users", user.uid, "history", existingItem.id));
          }
          const docRef = await addDoc(
            collection(db, "users", user.uid, "history"),
            newItem,
          );
          newItem.id = docRef.id;
          setHistory((prev) => [newItem, ...prev.filter((item) => item.url !== url)]);
        } catch (e) {
          console.error("Failed to save to Firestore", e);
          setHistory((prev) => [newItem, ...prev.filter((item) => item.url !== url)].slice(0, 20));
        }
      } else {
        setHistory((prev) => [newItem, ...prev.filter((item) => item.url !== url)].slice(0, 20)); // Keep last 20
      }

      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Summary Complete", {
            body: "Your YouTube video summary is ready.",
            icon: "/vite.svg",
          });
        } catch (e) {
          if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then((registration) => {
              registration.showNotification("Summary Complete", {
                body: "Your YouTube video summary is ready.",
                icon: "/vite.svg",
              });
            });
          }
        }
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
      setLoadingStatus(null);
    }
  }, [url, language, model, isViewingShared, loadingStatus, history, user]);

  const handleLoadHistory = (item: HistoryItem) => {
    setSummary(item.summary);
    setUsage(item.usage);
    setUrl(item.url);
    setModel(item.model);
    setLanguage(item.language);
    setIsViewingShared(false);
    setError(null);
    setLoadingStatus(null);

    // Scroll to result
    setTimeout(() => {
      document
        .getElementById("summary-result")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleDeleteHistory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (user) {
      try {
        await deleteDoc(doc(db, "users", user.uid, "history", id));
        setHistory((prev) => prev.filter((item) => item.id !== id));
      } catch (e) {
        console.error("Failed to delete from Firestore", e);
      }
    } else {
      setHistory((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handlePublish = useCallback(() => {
    if (!summary) return;
    try {
      const utf8ToB64 = (str: string) =>
        btoa(
          encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
            String.fromCharCode(Number("0x" + p1)),
          ),
        );
      const encodedSummary = utf8ToB64(summary);
      const shareUrl = `${window.location.origin}${window.location.pathname}#/view/${encodeURIComponent(encodedSummary)}`;
      setPublishedUrl(shareUrl);
    } catch (e) {
      setError("Failed to create share link.");
    }
  }, [summary]);

  const languageOptions = [
    { value: "Italian", label: "Italiano" },
    { value: "English", label: "English" },
    { value: "Spanish", label: "Español" },
    { value: "French", label: "Français" },
    { value: "German", label: "Deutsch" },
    { value: "Japanese", label: "日本語" },
    { value: "Korean", label: "한국어" },
    { value: "Chinese (Simplified)", label: "中文" },
  ];

  const modelOptions = [
    { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (Fastest)" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Fast)" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (High Quality)" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 font-sans relative overflow-x-hidden">
      <div className="absolute top-4 right-4 z-50">
        {isAuthLoading ? (
          <div className="h-10 w-24 bg-slate-800 animate-pulse rounded-lg"></div>
        ) : user ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt="User"
                  className="w-8 h-8 rounded-full border border-slate-700"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="text-sm font-medium text-slate-300 hidden sm:block">
                {user.displayName}
              </span>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            Sign in with Google
          </button>
        )}
      </div>

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12 sm:py-20 flex flex-col items-center">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
              Video Summarizer
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Turn long YouTube videos into concise, actionable summaries in
            seconds. Powered by{" "}
            <span className="text-indigo-400 font-semibold">Gemini 3</span>.
          </p>
        </div>

        <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-1 shadow-2xl">
          <div className="bg-slate-950/50 rounded-[22px] p-6 sm:p-10 space-y-8">
            <UrlInput
              url={url}
              setUrl={setUrl}
              onSubmit={handleSummarize}
              isLoading={isLoading}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <SettingsSelect
                label="Target Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={languageOptions}
                icon={<GlobeIcon className="h-5 w-5" />}
                disabled={isLoading}
              />
              <SettingsSelect
                label="AI Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                options={modelOptions}
                icon={<CpuChipIcon className="h-5 w-5" />}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 w-full p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 flex items-center gap-3">
            <svg
              className="w-6 h-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <SummaryDisplay
          summary={summary}
          usage={usage}
          isLoading={isLoading}
          loadingStatus={loadingStatus}
          onPublish={handlePublish}
          isViewingShared={isViewingShared}
          model={model}
        />

        {/* History Section */}
        {history.length > 0 && (
          <div className="mt-16 w-full animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <div className="flex items-center gap-3 mb-6 px-2">
              <HistoryIcon className="h-6 w-6 text-indigo-400" />
              <h2 className="text-2xl font-bold text-white">
                Recent Summaries
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleLoadHistory(item)}
                  className="group relative bg-slate-900/40 border border-slate-800 rounded-xl p-5 cursor-pointer hover:border-indigo-500/50 hover:bg-slate-900/60 transition-all duration-300"
                >
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <h3 className="font-semibold text-slate-200 line-clamp-1 flex-1 group-hover:text-indigo-300 transition-colors">
                      {item.title}
                    </h3>
                    <button
                      onClick={(e) => handleDeleteHistory(e, item.id)}
                      className="text-slate-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="bg-slate-800 px-2 py-0.5 rounded text-indigo-400 font-medium">
                      {item.language}
                    </span>
                    <span className="flex items-center gap-1">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                    <span className="ml-auto text-slate-600 italic">
                      {item.model === "gemini-3.1-pro-preview"
                        ? "Gemini 3.1 Pro"
                        : item.model === "gemini-3.1-flash-lite-preview"
                        ? "Gemini 3.1 Flash Lite"
                        : "Gemini 3 Flash"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="w-full text-center py-8 text-slate-600 text-sm relative z-10">
        &copy; {new Date().getFullYear()} Video Summarizer AI
      </footer>

      {publishedUrl && (
        <PublishModal
          url={publishedUrl}
          onClose={() => setPublishedUrl(null)}
        />
      )}
    </div>
  );
};

export default App;
