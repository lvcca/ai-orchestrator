# ai-orchestrator
=====================================

## Overview

A light ai-orchestrator written in Typescript.

## Installation

To install simply run the following command in your terminal:

```bash
git checkout git@github.com:lvcca/ai-orchestrator.git;
cd ai-orchestrator;
docker compose down;
docker compose up --build --force-recreate;
```

## Usage

```typescript
fetch("http://localhost:8080/task/newTask", {
  method: "GET",
  headers: { 
    "Content-Type": "application/json", 
    "task": "How should I go about starting a business?", 
    "id": crypto.randomUUID()
  }
})
```

```shell
curl -X GET "http://localhost:8080/task/newTask" \
  -H "Content-Type: application/json" \
  -H "task: How should I go about starting a business?" \
  -H "id: 550e8400-e29b-41d4-a716-446655440000"
```

### Output

```shell
  {<LLM_RESULT>}
```

## Contributing

We welcome contributions from developers and users. If you'd like to contribute to the ai-orchestrator project, please submit a pull request with your changes.

## License

AI-Agents is released under the [MIT License](https://opensource.org/licenses/MIT).

## Issues

If you encounter any issues or have questions about using AI-Agents, please submit an issue on our GitHub repository.
