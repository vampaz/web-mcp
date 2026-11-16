<script>
  import { useWebMCPTool, useWebMCPTools } from './index'

  export let tool
  export let tools = []
  export let revision

  useWebMCPTool(tool)
  useWebMCPTools(tools)
</script>

<p>{$revision}</p>
