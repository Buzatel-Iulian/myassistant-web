import { createBrowserRouter, Navigate } from "react-router";

import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AssistantsPage } from "@/pages/AssistantsPage";
import { ChatPage } from "@/pages/ChatPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { TemplatesPage } from "@/pages/TemplatesPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/chat" replace /> },
          { path: "chat/:configId?", element: <ChatPage /> },
          { path: "assistants", element: <AssistantsPage /> },
          { path: "templates", element: <TemplatesPage /> }
        ]
      }
    ]
  },
  // nginx answers every unknown path with index.html, so an unknown route lands here instead of a 404 page.
  { path: "*", element: <Navigate to="/chat" replace /> }
]);
