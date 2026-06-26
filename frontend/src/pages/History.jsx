import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/api";

function MarkdownAnswer({ text }) {
  const lines = (text || "").split("\n");
  const blocks = [];
  let index = 0;

  const isTableLine = (line) => line.trim().startsWith("|") && line.trim().endsWith("|");
  const isDividerLine = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed === "---") {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "heading", text: trimmed.replace(/^###\s+/, "") });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "heading", text: trimmed.replace(/^##\s+/, "") });
      index += 1;
      continue;
    }

    if (isTableLine(line)) {
      const tableLines = [];
      while (index < lines.length && isTableLine(lines[index])) {
        if (!isDividerLine(lines[index])) {
          tableLines.push(lines[index]);
        }
        index += 1;
      }

      const rows = tableLines.map((row) =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim())
      );

      if (rows.length > 0) {
        blocks.push({ type: "table", rows });
      }
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered", items });
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith("### ") &&
      !lines[index].trim().startsWith("## ") &&
      lines[index].trim() !== "---" &&
      !isTableLine(lines[index]) &&
      !/^[-*]\s+/.test(lines[index].trim()) &&
      !/^\d+\.\s+/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return (
    <div className="answer-markdown">
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          return <h3 key={blockIndex}>{block.text}</h3>;
        }

        if (block.type === "divider") {
          return <hr key={blockIndex} />;
        }

        if (block.type === "list") {
          return (
            <ul key={blockIndex}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered") {
          return (
            <ol key={blockIndex}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "table") {
          const [head, ...body] = block.rows;
          return (
            <div key={blockIndex} className="answer-table-wrap">
              <table className="answer-table">
                <thead>
                  <tr>
                    {head.map((cell, cellIndex) => (
                      <th key={cellIndex}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={blockIndex}>{block.text}</p>;
      })}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "날짜 정보 없음";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function History() {
  const navigate = useNavigate();
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistories = async () => {
    setLoading(true);

    try {
      const response = await api.get("/api/chat/history/");
      setHistories(response.data);
    } catch (error) {
      alert("상담 이력 조회에 실패했습니다.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistories();
  }, []);

  return (
    <div className="page">
      <div className="chat-card">
        <div className="section-header">
          <span className="badge">History</span>
          <h1>상담 이력</h1>
          <p>이전에 질문한 내용과 답변을 다시 확인할 수 있습니다.</p>
        </div>

        {loading && <div className="loading-box">상담 이력을 불러오는 중...</div>}

        {!loading && histories.length === 0 && (
          <div className="empty-box">
            아직 상담 이력이 없습니다.
            <button type="button" onClick={() => navigate("/chat")}>상담하러 가기</button>
          </div>
        )}

        {histories.map((item) => (
          <div key={item.id} className="message-box">
            <p className="date">{formatDate(item.created_at)}</p>
            <div className="question">Q. {item.question}</div>
            <div className="answer">
              <span className="answer-label">A.</span>
              <MarkdownAnswer text={item.answer} />
            </div>
          </div>
        ))}

        {histories.length > 0 && (
          <div className="action-row">
            <button type="button" onClick={() => navigate("/chat")}>새 질문하기</button>
            <button type="button" className="secondary-btn" onClick={() => navigate("/profile")}>
              건강정보 수정하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}