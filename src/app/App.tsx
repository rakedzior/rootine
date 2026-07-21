import { RouterProvider } from "react-router";
import { router } from "./routes";
import { GoalsProvider } from "./goals/goalsStore";

export default function App() {
  return (
    <GoalsProvider>
      <RouterProvider router={router} />
    </GoalsProvider>
  );
}
