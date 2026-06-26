import { Routes, Route, Link, useNavigate } from "react-router-dom";

import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Profile from "./pages/Profile.jsx";
import Chat from "./pages/Chat.jsx";
import History from "./pages/History.jsx";

function App() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    alert("로그아웃되었습니다.");
    navigate("/");
  };

  return (
    <div>
      <nav className="navbar">
        <div className="logo" onClick={() => navigate("/chat")}>
          MediPill
        </div>

        <div className="nav-links">
          <Link to="/">로그인</Link>
          <Link to="/signup">회원가입</Link>
          <Link to="/profile">건강정보</Link>
          <Link to="/chat">AI 상담</Link>
          <Link to="/history">상담이력</Link>
          <button type="button" className="logout-btn" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/history" element={<History />} />
      </Routes>
    </div>
  );
}

export default App;