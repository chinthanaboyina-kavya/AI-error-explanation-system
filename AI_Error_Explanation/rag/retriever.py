import os
import sqlite3
from pathlib import Path
from typing import Optional

# LangChain imports (compatible with langchain >= 0.2 and 1.x)
from langchain_community.vectorstores import FAISS
try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    from langchain_community.embeddings import HuggingFaceEmbeddings

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader
from langchain_core.documents import Document

# ─── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DOCUMENTS_DIR = BASE_DIR / "documents"
VECTOR_DB_DIR = BASE_DIR / "vector_db"
DB_PATH = BASE_DIR.parent / "database" / "errors.db"

# ─── Embedding Model ────────────────────────────────────────────────────────────
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # Fast, lightweight Sentence Transformers model


class ErrorRetriever:
    """
    RAG Retriever for AI Technical Error Explanation System.
    Uses FAISS vector store with SentenceTransformers embeddings.
    Supports LangChain document loading, chunking, and similarity retrieval.
    """

    def __init__(self):
        self.embeddings = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        self.vectorstore: Optional[FAISS] = None
        self._ensure_dirs()

    def _ensure_dirs(self):
        """Ensure all required directories exist."""
        DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
        VECTOR_DB_DIR.mkdir(parents=True, exist_ok=True)
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    # ─── Document Loading ───────────────────────────────────────────────────────

    def load_documents(self) -> list[Document]:
        """Load all .txt files from the documents directory."""
        docs: list[Document] = []
        txt_files = sorted(list(DOCUMENTS_DIR.glob("*.txt")))

        if not txt_files:
            print(f"[WARNING] No .txt files found in {DOCUMENTS_DIR}")
            return docs

        for txt_file in txt_files:
            try:
                loader = TextLoader(str(txt_file), encoding="utf-8")
                loaded = loader.load()
                # Tag each doc with its source language
                lang = txt_file.stem.replace("_errors", "")
                for doc in loaded:
                    doc.metadata["language"] = lang
                    doc.metadata["source"] = str(txt_file.name)
                docs.extend(loaded)
                print(f"[INFO] Loaded: {txt_file.name} ({len(loaded)} documents)")
            except Exception as e:
                print(f"[ERROR] Failed to load {txt_file.name}: {e}")

        return docs

    def split_documents(self, docs: list[Document]) -> list[Document]:
        """Split documents into semantic chunks for embedding."""
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=750,
            chunk_overlap=120,
            separators=["---", "\n\n", "\n", " "],
        )
        chunks = splitter.split_documents(docs)
        print(f"[INFO] Split into {len(chunks)} chunks")
        return chunks

    # ─── Vector Store ───────────────────────────────────────────────────────────

    def build_vectorstore(self, force_rebuild: bool = False) -> FAISS:
        """Build or load the FAISS vector store with self-healing fallback."""
        index_path = VECTOR_DB_DIR / "faiss_index"

        if not force_rebuild and index_path.exists() and (index_path / "index.faiss").exists():
            print("[INFO] Loading existing FAISS index...")
            try:
                self.vectorstore = FAISS.load_local(
                    str(index_path),
                    self.embeddings,
                    allow_dangerous_deserialization=True,
                )
                print("[INFO] FAISS index loaded successfully.")
                return self.vectorstore
            except Exception as e:
                print(f"[WARNING] Could not load saved FAISS index ({e}). Rebuilding automatically...")

        print("[INFO] Building FAISS index from knowledge documents...")
        docs = self.load_documents()

        if not docs:
            print("[WARNING] No documents found. Creating baseline placeholder index.")
            placeholder = [Document(page_content="AI Error Explanation System baseline index initialized.")]
            self.vectorstore = FAISS.from_documents(placeholder, self.embeddings)
        else:
            chunks = self.split_documents(docs)
            self.vectorstore = FAISS.from_documents(chunks, self.embeddings)

        try:
            self.vectorstore.save_local(str(index_path))
            print(f"[INFO] FAISS index saved to {index_path}")
        except Exception as e:
            print(f"[ERROR] Failed to persist FAISS index: {e}")

        return self.vectorstore

    def get_vectorstore(self) -> FAISS:
        """Get or initialize the vector store."""
        if self.vectorstore is None:
            self.build_vectorstore()
        return self.vectorstore

    # ─── Retrieval ──────────────────────────────────────────────────────────────

    def retrieve(self, query: str, k: int = 4) -> list[Document]:
        """Retrieve top-k relevant documents for a query."""
        vs = self.get_vectorstore()
        results = vs.similarity_search(query, k=k)
        return results

    def retrieve_with_scores(self, query: str, k: int = 4) -> list[tuple[Document, float]]:
        """Retrieve top-k documents with similarity scores."""
        vs = self.get_vectorstore()
        results = vs.similarity_search_with_score(query, k=k)
        return results

    # ─── Context Builder ────────────────────────────────────────────────────────

    def build_context(self, query: str, k: int = 4, language: str = "general") -> str:
        """Build a formatted context string from retrieved documents for LLM prompting."""
        if language in {"python", "java", "javascript", "sql"}:
            docs = self.retrieve(query, k=k * 4)
            docs = [doc for doc in docs if doc.metadata.get("language") == language]
            docs = docs[:k]
        else:
            docs = self.retrieve(query, k=k)
        if not docs:
            return "No relevant error documentation found in local knowledge base."

        context_parts = []
        for i, doc in enumerate(docs, 1):
            lang = doc.metadata.get("language", "general")
            source = doc.metadata.get("source", "knowledge_base")
            content = doc.page_content.strip()
            context_parts.append(
                f"[Reference {i} - {lang.upper()} ({source})]:\n{content}"
            )

        return "\n\n".join(context_parts)

    def get_knowledge_summary(self) -> dict:
        """Return information about loaded documents."""
        txt_files = list(DOCUMENTS_DIR.glob("*.txt"))
        languages = [f.stem.replace("_errors", "") for f in txt_files]
        return {
            "file_count": len(txt_files),
            "files": [f.name for f in txt_files],
            "languages": languages,
            "index_exists": (VECTOR_DB_DIR / "faiss_index").exists(),
        }


# ─── SQLite Error History & Analytics ──────────────────────────────────────────

def init_database():
    """Initialize the SQLite database with error_history and feedback tables."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS error_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                error_text  TEXT NOT NULL,
                language    TEXT DEFAULT 'general',
                explanation TEXT,
                model_used  TEXT DEFAULT 'llama3.2',
                timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Schema migration: ensure model_used & user_email columns exist in existing databases
        cursor.execute("PRAGMA table_info(error_history)")
        columns = [col[1] for col in cursor.fetchall()]
        if "model_used" not in columns:
            cursor.execute("ALTER TABLE error_history ADD COLUMN model_used TEXT DEFAULT 'llama3.2'")
        if "user_email" not in columns:
            cursor.execute("ALTER TABLE error_history ADD COLUMN user_email TEXT DEFAULT ''")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                history_id  INTEGER REFERENCES error_history(id) ON DELETE CASCADE,
                rating      INTEGER CHECK(rating BETWEEN 1 AND 5),
                comment     TEXT,
                timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()
    print(f"[INFO] Database initialized at {DB_PATH}")


def save_error_to_db(error_text: str, language: str, explanation: str, model_used: str = "llama3.2", user_email: str = "") -> int:
    """Save an error query and its explanation to SQLite. Returns the row id."""
    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO error_history (error_text, language, explanation, model_used, user_email)
               VALUES (?, ?, ?, ?, ?)""",
            (error_text, language, explanation, model_used, user_email),
        )
        row_id = cursor.lastrowid
        conn.commit()
    return row_id


def get_recent_errors(limit: int = 20, user_email: str = "") -> list[dict]:
    """Retrieve the most recent error queries from SQLite. Optionally filter by user_email."""
    if not DB_PATH.exists():
        return []
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        if user_email:
            cursor.execute(
                "SELECT * FROM error_history WHERE user_email = ? OR user_email = '' ORDER BY id DESC LIMIT ?",
                (user_email, limit),
            )
        else:
            cursor.execute(
                "SELECT * FROM error_history ORDER BY id DESC LIMIT ?",
                (limit,),
            )
        rows = [dict(row) for row in cursor.fetchall()]
    return rows


def delete_history_item(history_id: int) -> bool:
    """Delete a specific history entry."""
    if not DB_PATH.exists():
        return False
    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM error_history WHERE id = ?", (history_id,))
        cursor.execute("DELETE FROM feedback WHERE history_id = ?", (history_id,))
        conn.commit()
        return cursor.rowcount > 0


def clear_all_history() -> bool:
    """Clear all saved error history and feedback."""
    if not DB_PATH.exists():
        return False
    with sqlite3.connect(str(DB_PATH)) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM feedback")
        cursor.execute("DELETE FROM error_history")
        conn.commit()
        return True


def get_database_stats() -> dict:
    """Return database statistics (total queries, languages, ratings)."""
    if not DB_PATH.exists():
        return {"total_queries": 0, "avg_rating": 0, "by_language": {}}

    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as count FROM error_history")
        total_queries = cursor.fetchone()["count"]

        cursor.execute("SELECT language, COUNT(*) as count FROM error_history GROUP BY language")
        by_language = {row["language"]: row["count"] for row in cursor.fetchall()}

        cursor.execute("SELECT AVG(rating) as avg_rating, COUNT(*) as rating_count FROM feedback")
        fb_row = cursor.fetchone()
        avg_rating = round(fb_row["avg_rating"], 1) if fb_row["avg_rating"] is not None else None
        rating_count = fb_row["rating_count"]

    return {
        "total_queries": total_queries,
        "by_language": by_language,
        "avg_rating": avg_rating,
        "rating_count": rating_count,
    }


# ─── Singleton Retriever ─────────────────────────────────────────────────────────

_retriever_instance: Optional[ErrorRetriever] = None


def get_retriever() -> ErrorRetriever:
    """Get or create the singleton ErrorRetriever instance."""
    global _retriever_instance
    if _retriever_instance is None:
        _retriever_instance = ErrorRetriever()
    return _retriever_instance


if __name__ == "__main__":
    init_database()
    retriever = get_retriever()
    retriever.build_vectorstore(force_rebuild=True)

    test_query = "JavaScript TypeError Cannot read properties of undefined reading map"
    print(f"\n[TEST] Query: {test_query}")
    context = retriever.build_context(test_query)
    print(context[:600])
