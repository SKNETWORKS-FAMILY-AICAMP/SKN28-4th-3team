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

export default function Chat() {
  const navigate = useNavigate();

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);

  const exampleQuestions = [
    "타이레놀을 공복에 먹어도 되나요?",
    "이부프로펜을 감기약과 같이 먹어도 되나요?",
    "항생제를 복용할 때 주의할 점은 무엇인가요?",
  ];

  const labelMap = {
    FEMALE: "여성",
    MALE: "남성",
    OTHER: "기타",
    UNKNOWN: "미입력",
    NONE: "해당 없음",
    PREGNANT: "임신 중",
    BREASTFEEDING: "수유 중",
  };

  const label = (value) => labelMap[value] || value || "미입력";

  const fetchProfile = async () => {
    try {
      const response = await api.get("/api/profile/");
      setProfile(response.data);
    } catch {
      setProfile(null);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();

    if (!question.trim()) {
      alert("질문을 입력해주세요.");
      return;
    }

    const userQuestion = question;
    setQuestion("");
    setLoading(true);

    try {
      const response = await api.post("/api/chat/", {
        question: userQuestion,
      });

      setMessages((prev) => [
        ...prev,
        {
          question: response.data.question,
          answer: response.data.answer,
          sources: response.data.sources || [],
          answerMode: response.data.answer_mode,
        },
      ]);
    } catch (error) {
      alert("채팅 요청에 실패했습니다.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (text) => {
    setQuestion(text);
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <div className="page">
      <div className="chat-card">
        <div className="section-header">
          <span className="badge">Step 3</span>
          <h1>AI 의약품 상담</h1>
          <p>
            저장된 건강정보와 의약품 데이터를 함께 참고해 복용 전 필요한 주의사항을
            안내합니다.
          </p>
        </div>

        {profile ? (
          <div className="profile-summary-card">
            <div className="summary-top">
              <div>
                <p className="summary-label">내 건강정보 요약</p>
                <h3>
                  {profile.age}세 · {label(profile.gender)} · {profile.weight}kg
                </h3>
              </div>
              <button
                type="button"
                className="small-secondary-btn"
                onClick={() => navigate("/profile")}
              >
                건강정보 수정
              </button>
            </div>

            <div className="summary-card-grid">
              <div className="summary-item">
                <span>혈액형</span>
                <strong>{label(profile.blood_type)}</strong>
              </div>
              <div className="summary-item">
                <span>임신/수유</span>
                <strong>{label(profile.pregnancy_status)}</strong>
              </div>
              <div className="summary-item danger">
                <span>알레르기</span>
                <strong>{profile.allergies || "없음"}</strong>
              </div>
              <div className="summary-item warning">
                <span>기저질환</span>
                <strong>{profile.diseases || "없음"}</strong>
              </div>
              <div className="summary-item info">
                <span>복용약</span>
                <strong>{profile.current_medications || "없음"}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="profile-summary warning">
            건강정보가 등록되어 있지 않습니다.
            <button
              type="button"
              className="small-secondary-btn"
              onClick={() => navigate("/profile")}
            >
              건강정보 등록하기
            </button>
          </div>
        )}

        <div className="example-list pretty">
          {exampleQuestions.map((item) => (
            <button
              key={item}
              type="button"
              className="example-chip"
              onClick={() => handleExampleClick(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="chat-form">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예: 타이레놀을 공복에 먹어도 되나요?"
          />
          <button type="submit" disabled={loading}>
            {loading ? "생성 중..." : "질문하기"}
          </button>
        </form>

        {loading && (
          <div className="loading-box">
            건강정보와 의약품 데이터를 참고해 답변을 생성하고 있습니다...
          </div>
        )}

        <div className="message-list">
          {messages.map((msg, index) => (
            <div key={index} className="message-box">
              <div className="question">Q. {msg.question}</div>
              <div className="answer">
                <span className="answer-label">A.</span>
                <MarkdownAnswer text={msg.answer} />
              </div>
              {msg.sources?.length > 0 && (
                <div className="source-list">
                  <strong>참고 출처</strong>
                  {msg.sources.slice(0, 3).map((source, sourceIndex) => (
                    <div key={sourceIndex} className="source-item">
                      {source.title || "제목 없음"}
                      {source.manufacturer ? ` / ${source.manufacturer}` : ""}
                      {source.source ? ` / ${source.source}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {messages.length > 0 && (
          <div className="action-row">
            <button type="button" onClick={() => navigate("/history")}>
              상담 이력 보기
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => navigate("/profile")}
            >
              건강정보 수정하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}