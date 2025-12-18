@echo off
echo 测试修复后的分类效果
echo ========================

echo.
echo 测试用例1: "大模型的技术民主化"
echo 应该分类为: search
curl -X POST http://localhost:3000/api/local-aibot/classify ^
  -H "Content-Type: application/json" ^
  -d "{\"userInput\":\"大模型的技术民主化\",\"messages\":[]}"

echo.
echo.
echo 测试用例2: "量子力学的哲学意义"
echo 应该分类为: search
curl -X POST http://localhost:3000/api/local-aibot/classify ^
  -H "Content-Type: application/json" ^
  -d "{\"userInput\":\"量子力学的哲学意义\",\"messages\":[]}"

echo.
echo.
echo 测试用例3: "今天天气怎么样"
echo 应该分类为: other
curl -X POST http://localhost:3000/api/local-aibot/classify ^
  -H "Content-Type: application/json" ^
  -d "{\"userInput\":\"今天天气怎么样\",\"messages\":[]}"

echo.
echo.
echo 测试完成！
pause