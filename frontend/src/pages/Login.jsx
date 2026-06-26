import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/api";

export default function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!form.username.trim() || !form.password.trim()) {
      alert("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/api/token/", form);

      localStorage.setItem("accessToken", response.data.access);
      localStorage.setItem("refreshToken", response.data.refresh);

      alert("로그인 성공! 건강정보 등록 화면으로 이동합니다.");
      navigate("/profile");
    } catch (error) {
      alert("로그인 실패: 아이디 또는 비밀번호를 확인해주세요.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="hero-card">
        <span className="badge">Personalized Medicine Q&A</span>
        <h1>내 건강정보를 반영한 의약품 상담</h1>
        <p>
          MediPill은 사용자의 건강 프로필을 바탕으로 의약품 복용 주의사항을
          안내하는 LLM 연동 웹 애플리케이션입니다.
        </p>

        <div className="feature-list">
          <div>건강정보 기반 맞춤 답변</div>
          <div>상담 이력 저장</div>
          <div>JWT 인증 기반 개인화</div>
        </div>
      </div>

      <div className="card auth-card">
        <h2>로그인</h2>
        <p className="sub-text">계정으로 로그인하고 상담을 시작하세요.</p>

        <form onSubmit={handleLogin}>
          <label>아이디</label>
          <input
            name="username"
            placeholder="아이디를 입력하세요"
            value={form.username}
            onChange={handleChange}
            required
          />

          <label>비밀번호</label>
          <input
            name="password"
            type="password"
            placeholder="비밀번호를 입력하세요"
            value={form.password}
            onChange={handleChange}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="bottom-text">
          아직 계정이 없나요? <Link to="/signup">회원가입하기</Link>
        </p>
      </div>
    </div>
  );
}