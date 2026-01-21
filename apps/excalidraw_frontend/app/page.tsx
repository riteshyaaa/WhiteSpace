import { Pencil, Zap, Users, Download, Share2, Lock, Grid, Palette } from 'lucide-react';
import Link from 'next/link';

function App() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Pencil className="w-8 h-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">DailyDraw</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition">Features</a>
              <a href="#about" className="text-gray-600 hover:text-gray-900 transition">About</a>
              <a href="#" className="text-gray-600 hover:text-gray-900 transition">Docs</a>
              <Link href={"/signin"}><button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-medium">
                Start Drawing
              </button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-cyan-50 py-20 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
                Sketch with the freedom
                <br />
                <span className="text-blue-600">of hand-drawn diagrams</span>
              </h1>
              <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
                A virtual whiteboard for sketching hand-drawn like diagrams.
                Collaborative, end-to-end encrypted, and open source.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition font-medium text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all">
                  Start Drawing Now
                </button>
                <button className="bg-white text-gray-900 px-8 py-4 rounded-lg hover:bg-gray-50 transition font-medium text-lg border-2 border-gray-200 hover:border-gray-300">
                  View Examples
                </button>
              </div>
            </div>

            <div className="mt-16 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-3xl transform rotate-1"></div>
              <div className="relative bg-white rounded-2xl shadow-2xl p-8 border-2 border-gray-200">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-400"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  </div>
                  <div className="flex-1 text-center text-sm text-gray-500 font-medium">
                    Untitled Diagram
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg h-96 flex items-center justify-center border border-gray-200">
                  <div className="space-y-8">
                    <div className="flex items-center justify-center space-x-8">
                      <div className="w-32 h-32 border-4 border-blue-600 rounded-lg transform -rotate-2 flex items-center justify-center">
                        <span className="text-blue-600 font-bold">Idea</span>
                      </div>
                      <svg className="w-16 h-16 text-gray-600" viewBox="0 0 100 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M 0 25 Q 25 0, 50 25 T 100 25" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
                        <path d="M 85 15 L 100 25 L 85 35" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <div className="w-32 h-32 border-4 border-green-600 rounded-full transform rotate-3 flex items-center justify-center">
                        <span className="text-green-600 font-bold">Create</span>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <div className="border-4 border-orange-500 rounded-lg px-6 py-3 transform -rotate-1">
                        <span className="text-orange-500 font-bold">Share</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-center space-x-4">
                  <button className="p-2 hover:bg-gray-100 rounded" title="Select">
                    <Grid className="w-5 h-5 text-gray-600" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded" title="Draw">
                    <Pencil className="w-5 h-5 text-gray-600" />
                  </button>
                  <button className="p-2 hover:bg-gray-100 rounded" title="Colors">
                    <Palette className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="w-px h-6 bg-gray-300"></div>
                  <button className="p-2 hover:bg-gray-100 rounded" title="Share">
                    <Share2 className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Everything you need to visualize ideas
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Powerful features wrapped in a simple, intuitive interface
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-gradient-to-br from-blue-50 to-white p-8 rounded-2xl border border-blue-100 hover:shadow-lg transition">
                <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Lightning Fast</h3>
                <p className="text-gray-600">
                  Instant load times with no setup required. Start sketching immediately with our optimized canvas.
                </p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-white p-8 rounded-2xl border border-green-100 hover:shadow-lg transition">
                <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Real-time Collaboration</h3>
                <p className="text-gray-600">
                  Work together seamlessly with live cursors, instant updates, and shared editing.
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-white p-8 rounded-2xl border border-purple-100 hover:shadow-lg transition">
                <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">End-to-End Encrypted</h3>
                <p className="text-gray-600">
                  Your data is encrypted in transit and at rest. Share links are encrypted by default.
                </p>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-white p-8 rounded-2xl border border-orange-100 hover:shadow-lg transition">
                <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center mb-4">
                  <Download className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Export Anywhere</h3>
                <p className="text-gray-600">
                  Export to PNG, SVG, or clipboard. Integrate with your favorite tools and workflows.
                </p>
              </div>

              <div className="bg-gradient-to-br from-cyan-50 to-white p-8 rounded-2xl border border-cyan-100 hover:shadow-lg transition">
                <div className="w-12 h-12 bg-cyan-600 rounded-lg flex items-center justify-center mb-4">
                  <Share2 className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Easy Sharing</h3>
                <p className="text-gray-600">
                  Share your work with a simple link. Set permissions and control access easily.
                </p>
              </div>

              <div className="bg-gradient-to-br from-pink-50 to-white p-8 rounded-2xl border border-pink-100 hover:shadow-lg transition">
                <div className="w-12 h-12 bg-pink-600 rounded-lg flex items-center justify-center mb-4">
                  <Palette className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Customizable</h3>
                <p className="text-gray-600">
                  Choose from multiple themes, fonts, and styles to match your personal preference.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="py-20 bg-gradient-to-br from-gray-50 to-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-4xl font-bold text-gray-900 mb-6">
                  Built for designers, developers, and thinkers
                </h2>
                <p className="text-lg text-gray-600 mb-6">
                  Excalidraw is an open source virtual whiteboard that lets you easily sketch diagrams
                  with a hand-drawn feel. Perfect for wireframes, flowcharts, system designs, and brainstorming.
                </p>
                <p className="text-lg text-gray-600 mb-8">
                  Used by teams at leading companies worldwide to visualize ideas, collaborate remotely,
                  and bring concepts to life.
                </p>
              
                <button className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition font-medium">
                  Get Started Free
                </button>
               
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                  <div className="text-4xl font-bold text-blue-600 mb-2">10M+</div>
                  <div className="text-gray-600">Monthly Users</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                  <div className="text-4xl font-bold text-green-600 mb-2">50M+</div>
                  <div className="text-gray-600">Diagrams Created</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                  <div className="text-4xl font-bold text-orange-600 mb-2">100%</div>
                  <div className="text-gray-600">Open Source</div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                  <div className="text-4xl font-bold text-purple-600 mb-2">45K+</div>
                  <div className="text-gray-600">GitHub Stars</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-blue-600">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl font-bold text-white mb-6">
              Ready to start sketching?
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
              Join millions of users who trust Excalidraw for their visual thinking needs
            </p>
            <button className="bg-white text-blue-600 px-8 py-4 rounded-lg hover:bg-gray-100 transition font-medium text-lg shadow-lg">
              Launch Excalidraw
            </button>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Pencil className="w-6 h-6 text-blue-400" />
                <span className="text-xl font-bold text-white">Excalidraw</span>
              </div>
              <p className="text-sm">
                Virtual whiteboard for sketching hand-drawn like diagrams
              </p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Features</a></li>
                <li><a href="#" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition">Integrations</a></li>
                <li><a href="#" className="hover:text-white transition">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition">Tutorials</a></li>
                <li><a href="#" className="hover:text-white transition">Community</a></li>
                <li><a href="#" className="hover:text-white transition">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">About</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Careers</a></li>
                <li><a href="#" className="hover:text-white transition">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-sm text-center">
            <p>&copy; 2024 Excalidraw. Open source and free forever.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
