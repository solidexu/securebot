# SecureBot

A secure multi-agent AI assistant with CLI interface.

**[中文文档](README.md)**

## Core Features

- **Multi-Agent Isolation** - Different purposes use independent Agents with completely isolated workspaces
- **Three-Layer Memory Architecture** - Working memory + Structured memory + RAG vector retrieval
- **Intelligent Skill System** - Public/private skills with keyword + semantic dual wake-up
- **Local Model First** - Integrates with Ollama, data never leaves your machine
- **Security Confirmation** - Graded confirmation for sensitive operations, preventing data leakage
- **RAG Knowledge Base** - Three-stage retrieval enhancement, supports document Q&A

> 📑 **[View Full Security Architecture Documentation →](assets/SECURITY.md)** - Learn how SecureBot implements enterprise-grade data security.

## Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/solidexu/securebot.git
cd securebot

# Install dependencies
npm install

# Build and install globally
npm run build
npm link
```

### Configuration

```bash
# Start Ollama
ollama serve

# Download model
ollama pull qwen3.5:35b-a3b

# Run configuration wizard
securebot init
```

> 💡 **Recommended for GPU users**: RTX 3090+ users can use `mdq100/qwen3.5-flash:35b-code` for faster responses.

### Start Chat

```bash
securebot chat
```

---

## Best Practice Example

### Scenario: Creating a Python Development Assistant

**Step 1: Create Agent**

```bash
securebot agent create
```

Enter as prompted:
```
Agent ID: py_dev
Agent Name: PyBro
Permission Preset: coding
```

**Step 2: Add Knowledge Base (Optional)**

```bash
# Install embedding model
ollama pull all-minilm

# Copy project docs to knowledge base
cp ~/my-project/docs/*.md ~/.securebot/knowledges/py_dev/
```

**Step 3: Start Using**

```bash
securebot chat

[PyBro] > Help me analyze this project's architecture

# Switch to other Agent
[PyBro] > @dev Help me write a React component

# Let Agent remember important info
[PyBro] > Remember the project path is /home/user/my-project
[PyBro] Got it, remembered. (importance=5, auto-synced to RAG)

# Use skills
[PyBro] > Help me review this code
[PyBro] [Skill: code-review] I'll help you review the code...
```

**Step 4: Create Personal Skill**

```
[PyBro] > /skill create

Skill ID: fastapi-helper
Skill Name: FastAPI Helper
Description: Help write FastAPI endpoint code
Keywords: fastapi, api, endpoint

# Later, mentioning related keywords will auto-wake the skill
[PyBro] > Help me write a fastapi endpoint
[PyBro] [Skill: fastapi-helper] Detected FastAPI related request...
```

---

## Three-Layer Memory Architecture

SecureBot's memory system has three layers, ensuring information is neither lost nor causes context bloat:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Vector Memory (RAG)                               │
│  - Historical documents, long-term knowledge                │
│  - Retrieved on demand, doesn't occupy context              │
│  - Memories with importance >= 4 auto-sync                  │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Structured Memory                                 │
│  ├── profiles/    User/Agent profiles (preferences, stats)  │
│  ├── events/      Important event records                   │
│  └── summaries/   Memory summaries (auto-compress above     │
│                    threshold)                                │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Working Memory (daily/)                           │
│  - Recent 3 days of conversations, tasks                     │
│  - Auto-loaded, sorted by importance                         │
│  - Auto-decay, low-importance memories gradually forgotten   │
└─────────────────────────────────────────────────────────────┘
```

### Memory Types

| Type | Description | Auto Trigger |
|------|-------------|--------------|
| `conversation` | Conversation records | Each conversation |
| `task` | Task completion | Successful tool call |
| `knowledge` | Knowledge points | User explicitly asks to remember |
| `event` | Important events | File create/delete, etc. |
| `preference` | User preferences | "I like..." |

### Intelligent Importance Assessment

System auto-evaluates memory importance (1-5 points):

- **Base score**: 3 points
- **+2 points**: Keywords like "remember", "important", "critical"
- **+1 point**: Contains paths, configs, project-related
- **+1 point**: Content length > 500 characters

**Memories with importance >= 4 are auto-synced to RAG**, achieving long-term memory.

### Memory Commands

```
/memory stats       # View memory statistics
/memory search <keyword>  # Search memories
/memory trigger     # Manually trigger summary compression
```

---

## Skill System

### Public Skills vs Private Skills

```
~/.securebot/
├── skills/
│   └── public/              # Public skills (available to all Agents)
│       ├── code-review.json
│       ├── translator.json
│       └── ...
└── agents/
    └── {agentId}/
        └── skills/          # Private skills (only for this Agent)
            ├── fastapi-helper.json
            └── my-custom.json
```

### Built-in Public Skills

| Skill | Keywords | Description |
|-------|----------|-------------|
| code-review | review, check code | Professional code review |
| translator | translate | Multi-language translation |
| api-designer | API, RESTful | RESTful API design |
| debugger | debug, error, bug | Problem diagnosis |
| doc-writer | document, readme | Technical documentation |

### Smart Wake-up Mechanism

Skills support two wake-up methods:

1. **Keyword Matching** - Fast matching, high priority
2. **Semantic Matching** - Uses RAG embedding to understand intent

```
User: Help me check what's wrong with this code
System: Detected keyword "wrong" → wake up debugger skill

User: This API response is too slow, how to optimize
System: Semantic match → wake up api-designer skill
```

### Creating Skills

**CLI Method:**

```bash
securebot skill create
```

**Conversation Method:**

```
[Dev Assistant] > /skill create
Skill ID: my-helper
Skill Name: My Helper
Description: Help with daily work
Keywords: help, assist
```

**Direct JSON Editing:**

```json
// ~/.securebot/agents/dev/skills/my-helper.json
{
  "id": "my-helper",
  "name": "My Helper",
  "description": "Help with daily work",
  "keywords": ["help", "assist"],
  "systemPrompt": "You are a professional assistant...",
  "tools": ["read", "write"],
  "isPublic": false,
  "agentId": "dev"
}
```

---

## RAG Knowledge Base

### Three-Stage Retrieval Process

```
User Query
    ↓
┌─────────────────┐
│  1. Query       │  Synonym expansion,
│     Expansion   │  keyword extraction
└────────┬────────┘
         ↓
┌─────────────────┐
│  2. Vector      │  Embedding + similarity
│     Retrieval   │  search
└────────┬────────┘
         ↓
┌─────────────────┐
│  3. Reranking   │  Optional Rerank model
│                 │  for precision
└────────┬────────┘
         ↓
Return most relevant documents
```

### Configuring RAG

```bash
# Install embedding model
ollama pull all-minilm

# Auto-detected and configured when creating Agent
securebot agent create
```

Or manually configure in `config.json`:

```json
{
  "agents": [{
    "id": "dev",
    "rag": {
      "enabled": true,
      "knowledgeDirs": ["~/.securebot/knowledges/dev"],
      "embeddingModel": "all-minilm",
      "enableRerank": false
    }
  }]
}
```

### RAG Tools

| Tool | Description |
|------|-------------|
| `rag_search <query>` | Search knowledge base |
| `rag_index <path>` | Index document directory |
| `rag_remember <content>` | Store directly to knowledge base |

---

## Security Mechanism

### Operation Grading Confirmation

| Sensitivity | Example Operations | Default Behavior |
|-------------|-------------------|------------------|
| `safe` | Read normal files | Auto execute |
| `low` | rag_index | Auto execute |
| `medium` | write, edit | Confirm first time |
| `high` | exec, sensitive files | Confirm every time |
| `critical` | Delete operations | Confirm every time + double confirm |

### Authorization Memory

When confirming, select:
- `y` - Allow this time
- `a` - Always allow this tool
- `p` - Always allow this directory

Authorization records are saved in `~/.securebot/config.json` under `tools.allowlist`.

### Audit Log

All tool calls are automatically logged:

```bash
securebot audit list        # View logs
securebot audit search rm   # Search delete operations
```

---

## CLI Command Reference

```bash
# Main commands
securebot chat              # Start conversation
securebot init              # Configuration wizard
securebot config            # View configuration

# Agent management
securebot agent list        # List all Agents
securebot agent create      # Interactive Agent creation
securebot agent show <id>   # View Agent details

# Skill management
securebot skill list        # List skills
securebot skill create      # Create skill
securebot skill assign      # Assign skill

# Audit
securebot audit list        # View audit logs
securebot audit search <kw> # Search logs
```

### In-Chat Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/agent [id]` | Switch/list Agents |
| `/skills` | View current skills |
| `/skill create` | Create skill |
| `/memory stats\|search` | Memory management |
| `/checkpoint` | Checkpoint management |
| `/perf` | Performance monitoring |
| `/exit` | Exit |

---

## Directory Structure

```
~/.securebot/
├── config.json              # Global configuration
├── agents/                  # Agent workspaces
│   └── dev/
│       ├── workspace/       # Working directory
│       └── skills/          # Private skills
├── memory/                  # Memory system
│   ├── daily/               # Daily working memory
│   ├── profiles/            # User/Agent profiles
│   ├── events/              # Event logs
│   └── summaries/           # Memory summaries
├── knowledges/              # RAG knowledge base
│   └── dev/                 # Isolated by Agent
├── skills/                  # Public skills
│   └── public/
├── sessions/                # Session persistence
└── audit/                   # Audit logs
```

---

## FAQ

### Ollama Connection Failed

```bash
ollama serve  # Ensure Ollama is running
```

### Memory is Empty

- Make sure to start with `securebot chat` (not `npm run dev`)
- Memory is automatically recorded during conversations

### Skills Not Working

- Check if keywords match
- View `/skills` to confirm skills are loaded
- Public skills are auto-initialized on first `securebot chat` run

### RAG Retrieval No Results

- Ensure embedding model installed: `ollama pull all-minilm`
- Ensure knowledge base directory has documents
- Use `rag_index <path>` to manually index

---

## Development

```bash
npm run dev        # Development mode
npm run build      # Build
npm test           # Run tests
npm run typecheck  # Type check
```

---

## License

This software is licensed under **CC BY-NC 4.0**.

- [LICENSE.md](LICENSE.md) - English Version
- [LICENSE_CN.md](LICENSE_CN.md) - Chinese Version

**Summary**: Free to share and adapt, but must attribute and not use for commercial purposes.