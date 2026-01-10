"use client";
export function AuthPage({ isSignin }: { isSignin: boolean }) {
  return (
    <div className=" items-center  justify-center flex  h-screen  ">
      <div className=" items-center justify-center flex flex-col gap-4 w-80 bg-white rounded-2xl  text-black  px-8 py-16 shadow-lg  align-center">
        <input
          className="border border-gray-400 p-2 rounded-md "
          type="email"
          placeholder="Email"
        />
        <input
          className="border border-gray-400 p-2 rounded-md "
          type="password"
          placeholder="Password"
        />
        <button
          className="bg-gray-600 cursor-pointer rounded-2xl  w-40 mt-2 pt-2 pb-2 text-white hover:bg-gray-700 shadow-md "
          onClick={() => {}}
        >
          {isSignin ? "Sign In" : "Sign Up"}{" "}
        </button>
      </div>
    </div>
  );
}
