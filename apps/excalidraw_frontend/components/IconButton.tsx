import { ReactNode } from "react";

export function IconButton({
  icon,
  onClick,
  activated,
}: {
  icon: ReactNode;
  onClick: () => void;
  activated: boolean;
}) {
  return (
    <div className="m-2 rounded-full bg-red hover:bg-gray-500 cursor-pointer  ">
      <button
        onClick={onClick}
        className={` p-2 rounded-full border cursor-pointer  ${activated ? "text-red-600" : "text-amber-300"}`}
      >
        {icon}
      </button>
    </div>
  );
}
