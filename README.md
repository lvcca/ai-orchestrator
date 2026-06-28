# ai-orchestrator
=====================================

## Overview

a light ai-orchestrator written in typescript.

![Demo](images/demo.gif)

## Installation

```bash
git clone git@github.com:lvcca/ai-orchestrator.git;

cd ai-orchestrator;

docker compose down;
docker compose up --build --force-recreate;
```

## Usage

```typescript
fetch("http://localhost:8080/exec/newExec", {
  method: "GET",
  headers: { 
    "Content-Type": "application/json", 
    "task": "Using only the FileSystemApi tools or system commands list the files in the current directory .", 
    "id": crypto.randomUUID()
  }
}).then(res => res.text()).then(console.log).catch(console.error)
```

```shell
curl -X GET "http://localhost:8080/task/newTask" \
  -H "Content-Type: application/json" \
  -H "task: Using only the FileSystemApi tools or system commands list the files in the current directory ." \
  -H "id: 550e8400-e29b-41d4-a716-446655440000" 
```

### Output

```shell
  {<LLM_RESULT>}
```

## Contributing

We welcome contributions from developers and users. If you'd like to contribute to the ai-orchestrator project, please submit a pull request with your changes.

## License

ai-orchestrator is released under the [MIT License](https://opensource.org/licenses/MIT).

## Issues

If you encounter any issues or have questions about using ai-orchestrator, please submit an issue on our GitHub repository.
