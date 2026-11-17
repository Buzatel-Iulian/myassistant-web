import { createBrowserRouter, Navigate } from "react-router";

import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AssistantEditPage } from "@/pages/AssistantEditPage";
import { AssistantsPage } from "@/pages/AssistantsPage";
import { ChatPage } from "@/pages/ChatPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { TemplateEditPage } from "@/pages/TemplateEditPage";
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
          // "new" and an id share one route: the page tells them apart.
          { path: "assistants/:configId", element: <AssistantEditPage /> },
          { path: "templates", element: <TemplatesPage /> },
          { path: "templates/:templateId", element: <TemplateEditPage /> }
        ]
      }
    ]
  },
  // nginx answers every unknown path with index.html, so an unknown route lands here instead of a 404 page.
  { path: "*", element: <Navigate to="/chat" replace /> }
]);
